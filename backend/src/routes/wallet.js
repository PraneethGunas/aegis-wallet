/**
 * Wallet REST routes — registration, balance, send, receive, history, settings.
 * Wired to real LND/litd services.
 */
import { Router } from "express";
import jwt from "jsonwebtoken";
import * as lnd from "../services/lnd.js";
import * as db from "../db/index.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "aegis-dev-secret";

// ── Auth middleware ──────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ── Create wallet (simplified — passkey verification done client-side) ──────
router.post("/create", async (req, res, next) => {
  try {
    const { credentialId, publicKey } = req.body;
    if (!credentialId || !publicKey) {
      return res.status(400).json({ error: "credentialId and publicKey required" });
    }

    const existing = db.getUser(credentialId);
    if (existing) {
      // Already registered — just issue token
      const token = jwt.sign({ credentialId }, JWT_SECRET, { expiresIn: "24h" });
      return res.json({ ok: true, credentialId, token });
    }

    db.createUser(credentialId);
    const token = jwt.sign({ credentialId }, JWT_SECRET, { expiresIn: "24h" });
    res.json({ ok: true, credentialId, token });
  } catch (err) { next(err); }
});

// ── Login (simplified — passkey assertion done client-side) ─────────────────
router.post("/login", async (req, res, next) => {
  try {
    const { credentialId } = req.body;
    if (!credentialId) return res.status(400).json({ error: "credentialId required" });

    const user = db.getUser(credentialId);
    if (!user) return res.status(404).json({ error: "Wallet not found" });

    const token = jwt.sign({ credentialId }, JWT_SECRET, { expiresIn: "24h" });
    res.json({ ok: true, token });
  } catch (err) { next(err); }
});

// ── Balance ─────────────────────────────────────────────────────────────────
router.get("/balance", auth, async (req, res, next) => {
  try {
    const [onchain, channels] = await Promise.allSettled([
      lnd.getWalletBalance(),
      lnd.getBalance(),
    ]);

    const l1Sats = onchain.status === "fulfilled"
      ? parseInt(onchain.value.confirmed_balance || "0") : 0;
    const l2Sats = channels.status === "fulfilled"
      ? parseInt(channels.value.balance_sats || "0") : 0;

    // BTC price — fetch from CoinGecko, fallback to 100k
    let btcPrice = 100000;
    try {
      const priceRes = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
        { signal: AbortSignal.timeout(3000) }
      );
      const priceData = await priceRes.json();
      if (priceData?.bitcoin?.usd) btcPrice = priceData.bitcoin.usd;
    } catch {}

    const totalSats = l1Sats + l2Sats;
    res.json({
      l1Sats,
      l2Sats,
      totalSats,
      l1Usd: +((l1Sats / 1e8) * btcPrice).toFixed(2),
      l2Usd: +((l2Sats / 1e8) * btcPrice).toFixed(2),
      totalUsd: +((totalSats / 1e8) * btcPrice).toFixed(2),
      btcPrice,
    });
  } catch (err) { next(err); }
});

// ── Send (on-chain or Lightning) ────────────────────────────────────────────
router.post("/send", auth, async (req, res, next) => {
  try {
    const { bolt11, txHex, address, amount_sats } = req.body;

    if (bolt11) {
      const result = await lnd.payInvoiceSync(bolt11);
      db.createTransaction({
        agent_id: null,
        type: "payment",
        amount_sats: parseInt(result.payment_route?.total_amt || "0"),
        purpose: "Manual payment",
        bolt11,
        payment_hash: result.payment_hash,
        status: result.payment_error ? "failed" : "settled",
        approval_type: null,
        approval_id: null,
      });
      res.json({ ok: true, result });
    } else if (txHex) {
      // Broadcast pre-signed on-chain tx
      const result = await lnd.publishTransaction(txHex);
      res.json({ ok: true, txid: result.txid });
    } else if (address && amount_sats) {
      const result = await lnd.sendCoins(address, amount_sats);
      res.json({ ok: true, txid: result.txid });
    } else {
      res.status(400).json({ error: "bolt11, txHex, or address+amount_sats required" });
    }
  } catch (err) { next(err); }
});

// ── Receive ─────────────────────────────────────────────────────────────────
router.post("/receive", auth, async (req, res, next) => {
  try {
    const { type, amountSats, memo } = req.body;

    if (type === "onchain" || type === "l1") {
      const { address } = await lnd.newAddress("TAPROOT_PUBKEY");
      res.json({ type: "onchain", address });
    } else {
      if (!amountSats) return res.status(400).json({ error: "amountSats required for Lightning" });
      const invoice = await lnd.addInvoice(amountSats, memo || "");
      res.json({
        type: "lightning",
        bolt11: invoice.bolt11 || invoice.payment_request,
        paymentHash: invoice.payment_hash || invoice.r_hash,
      });
    }
  } catch (err) { next(err); }
});

// ── History ─────────────────────────────────────────────────────────────────
router.get("/history", auth, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    // Get DB transactions
    const dbTxs = db.getTransactions(null, limit) || [];

    // Also get LND payment history
    let lndPayments = [];
    try {
      lndPayments = await lnd.listPayments(null, limit);
    } catch {}

    const transactions = dbTxs.map((tx) => ({
      id: tx.id,
      type: tx.agent_id ? "agent" : tx.type === "payment" ? "send" : tx.type,
      description: tx.purpose || `${tx.type} ${tx.amount_sats} sats`,
      amount: tx.type === "invoice" ? tx.amount_sats : -tx.amount_sats,
      amountSats: tx.amount_sats,
      isAgent: !!tx.agent_id,
      approvalType: tx.approval_type,
      txid: tx.payment_hash,
      timestamp: tx.created_at,
    }));

    res.json({ transactions });
  } catch (err) { next(err); }
});

// ── Settings ────────────────────────────────────────────────────────────────
router.put("/settings", auth, async (req, res, next) => {
  try {
    const { auto_pay_threshold_sats } = req.body;
    if (auto_pay_threshold_sats == null) {
      return res.status(400).json({ error: "auto_pay_threshold_sats required" });
    }
    // Update user threshold in DB
    const user = db.getUser(req.user.credentialId);
    if (user) {
      // db doesn't have updateUser yet, add it inline
      db.default.prepare(
        "UPDATE users SET auto_pay_threshold_sats = ? WHERE credential_id = ?"
      ).run(auto_pay_threshold_sats, req.user.credentialId);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Funding address (LND on-chain for L1→L2) ───────────────────────────────
router.get("/funding-address", auth, async (req, res, next) => {
  try {
    const { address } = await lnd.newAddress("TAPROOT_PUBKEY");
    res.json({ address });
  } catch (err) { next(err); }
});

// ── UTXOs (for client-side PSBT construction) ───────────────────────────────
router.get("/utxos", auth, async (req, res, next) => {
  try {
    const result = await lnd.listUnspent();
    res.json({ utxos: result.utxos || [] });
  } catch (err) { next(err); }
});

export default router;
