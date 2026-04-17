/**
 * Agent REST routes — create, status, update budget, revoke.
 * All state lives in litd accounts — no database.
 */
import { Router } from "express";
import * as litd from "../services/litd-gateway.js";
import { bakeAgentMacaroon, sendPayment as lndSendPayment } from "../services/lnd-gateway.js";
const router = Router();

// In-memory pending invoices (from webhook)
const pendingInvoices = [];

// SSE clients waiting for real-time events
const sseClients = new Set();

function broadcastSSE(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { sseClients.delete(res); }
  }
}

// ── SSE — real-time event stream for the dashboard ───────────────────────────
router.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  res.write(":\n\n"); // SSE comment to establish connection
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// ── Webhook — receives payment failure notifications from MCP ────────────────
router.post("/webhook", (req, res) => {
  const { event, bolt11, amount_sats, description, error, url, timestamp } = req.body;
  const invoice = { bolt11, amount_sats, description, error, url, timestamp: timestamp || new Date().toISOString() };
  pendingInvoices.push(invoice);
  broadcastSSE({ type: "payment_pending", invoice });
  res.json({ ok: true });
});

router.get("/webhook/pending", (req, res) => {
  res.json({ invoices: pendingInvoices });
});

router.post("/webhook/clear", (req, res) => {
  const { bolt11 } = req.body;
  const idx = pendingInvoices.findIndex((inv) => inv.bolt11 === bolt11);
  if (idx !== -1) pendingInvoices.splice(idx, 1);
  res.json({ ok: true, remaining: pendingInvoices.length });
});

// ── Create or update agent — one litd account per session ───────────────────
router.post("/create", async (req, res, next) => {
  try {
    const { budgetSats = 50000 } = req.body;

    // Create litd account with budget ceiling
    const account = await litd.createAccount(budgetSats, `aegis-${Date.now()}`);

    // Bake minimal-permission macaroon tied to this account
    const macaroon = await bakeAgentMacaroon(account.account_id);

    res.json({
      ok: true,
      macaroon,
      accountId: account.account_id,
      budgetSats: account.balance_sats,
    });
  } catch (err) { next(err); }
});

// ── Status — read from litd ────────────────────────────────────────────────
router.get("/status", async (req, res, next) => {
  try {
    const accounts = await litd.listAccounts();
    // Find the most recent aegis account
    const agent = accounts
      .filter((a) => (a.label || "").startsWith("aegis-"))
      .sort((a, b) => parseInt(b.last_update || "0") - parseInt(a.last_update || "0"))[0];

    if (!agent) return res.json({ agent: null });

    const balanceSats = parseInt(agent.current_balance || "0");
    res.json({
      agent: {
        id: agent.id,
        status: "active",
        budgetSats: balanceSats,
        balanceSats,
      },
    });
  } catch (err) { next(err); }
});

// ── Update budget ──────────────────────────────────────────────────────────
router.post("/budget", async (req, res, next) => {
  try {
    const { budgetSats, accountId } = req.body;
    if (!budgetSats || !accountId) {
      return res.status(400).json({ error: "budgetSats and accountId required" });
    }

    await litd.updateBalance(accountId, budgetSats);
    const macaroon = await bakeAgentMacaroon(accountId);
    res.json({ ok: true, budgetSats, macaroon });
  } catch (err) { next(err); }
});

// ── Pay directly (user pays when agent budget exceeded) ─────────────────────
router.post("/pay-direct", async (req, res, next) => {
  try {
    const { bolt11 } = req.body;
    if (!bolt11) return res.status(400).json({ error: "bolt11 required" });

    const result = await lndSendPayment(bolt11);
    if (!result.success) {
      return res.status(400).json({ error: `Payment failed: ${result.error}` });
    }

    res.json({
      ok: true,
      amount_sats: result.amount_sats,
      fee_sats: result.fee_sats,
      preimage: result.preimage,
      balance_remaining_sats: result.balance_remaining_sats,
    });
  } catch (err) { next(err); }
});

// ── Revoke — delete litd account ───────────────────────────────────────────
router.post("/revoke", async (req, res, next) => {
  try {
    const { accountId } = req.body;
    if (!accountId) return res.status(400).json({ error: "accountId required" });

    await litd.freezeAccount(accountId);
    res.json({ ok: true, message: "Agent revoked. Macaroon is now invalid." });
  } catch (err) { next(err); }
});

export default router;
