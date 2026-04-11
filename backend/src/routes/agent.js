/**
 * Agent REST routes — create, pair, status, topup, approve, pause.
 * Wired to real litd + DB services.
 */
import { Router } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import * as litd from "../services/litd.js";
import * as db from "../db/index.js";
import { emitToUser } from "../ws/notifications.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "aegis-dev-secret";

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

/** Find the user's active agent. */
function getUserAgent(credentialId) {
  // Query all agents for this user
  const agents = db.default.prepare(
    "SELECT * FROM agents WHERE user_credential_id = ? ORDER BY created_at DESC"
  ).all(credentialId);
  return agents[0] || null;
}

// ── Create Agent ────────────────────────────────────────────────────────────
router.post("/create", auth, async (req, res, next) => {
  try {
    const { budgetSats = 50000, autoPayLimitSats = 15000 } = req.body;
    const authToken = `aegis_agent_${crypto.randomBytes(24).toString("hex")}`;

    // Create litd account with budget
    let account;
    try {
      account = await litd.createAccount(budgetSats);
    } catch (err) {
      // litd not ready — create agent with placeholder
      account = { account_id: `pending_${Date.now()}`, macaroon: null, balance_sats: budgetSats };
    }

    const { id: agentId } = db.createAgent({
      user_credential_id: req.user.credentialId,
      litd_account_id: account.account_id,
      macaroon: account.macaroon,
      budget_sats: budgetSats,
      auth_token: authToken,
    });

    // Set auto-pay threshold
    db.default.prepare(
      "UPDATE users SET auto_pay_threshold_sats = ? WHERE credential_id = ?"
    ).run(autoPayLimitSats, req.user.credentialId);

    const mcpConfig = {
      mcpServers: {
        "aegis-wallet": {
          command: "node",
          args: ["backend/src/mcp/server.js", "--token", authToken],
          env: {
            AEGIS_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
          },
        },
      },
    };

    res.json({
      ok: true,
      agentId,
      authToken,
      budgetSats,
      status: "active",
      mcpConfig,
      pairingCommand: `claude mcp add aegis-wallet -- node backend/src/mcp/server.js --token ${authToken}`,
    });
  } catch (err) { next(err); }
});

// ── Pair (get pairing config for existing agent) ────────────────────────────
router.post("/pair", auth, async (req, res, next) => {
  try {
    const agent = getUserAgent(req.user.credentialId);
    if (!agent) return res.status(404).json({ error: "No agent found. Create one first." });

    const mcpConfig = {
      mcpServers: {
        "aegis-wallet": {
          command: "node",
          args: ["backend/src/mcp/server.js", "--token", agent.auth_token],
        },
      },
    };

    res.json({
      agentId: agent.id,
      authToken: agent.auth_token,
      mcpConfig,
      pairingCommand: `claude mcp add aegis-wallet -- node backend/src/mcp/server.js --token ${agent.auth_token}`,
    });
  } catch (err) { next(err); }
});

// ── Status ──────────────────────────────────────────────────────────────────
router.get("/status", auth, async (req, res, next) => {
  try {
    const agent = getUserAgent(req.user.credentialId);
    if (!agent) return res.json({ agent: null });

    const spentToday = db.getAgentSpendingToday(agent.id);
    const recentTxs = db.getTransactions(agent.id, 10);
    const user = db.getUser(req.user.credentialId);

    let balanceSats = agent.budget_sats;
    if (agent.litd_account_id && !agent.litd_account_id.startsWith("pending")) {
      try {
        // Try to get real balance from litd
        const { default: lndMod } = await import("../services/lnd.js");
        const bal = await lndMod.getBalance(agent.macaroon_encrypted);
        balanceSats = bal.balance_sats;
      } catch {}
    }

    res.json({
      agent: {
        id: agent.id,
        status: agent.status,
        budgetSats: agent.budget_sats,
        balanceSats,
        spentTodaySats: spentToday.total_sats,
        autoPayLimitSats: user?.auto_pay_threshold_sats ?? 15000,
        createdAt: agent.created_at,
        recentTransactions: recentTxs,
      },
    });
  } catch (err) { next(err); }
});

// ── Top-up ──────────────────────────────────────────────────────────────────
router.post("/topup", auth, async (req, res, next) => {
  try {
    const { amountSats } = req.body;
    const agent = getUserAgent(req.user.credentialId);
    if (!agent) return res.status(404).json({ error: "No agent found" });

    const newBudget = agent.budget_sats + (amountSats || 10000);
    db.default.prepare("UPDATE agents SET budget_sats = ? WHERE id = ?").run(newBudget, agent.id);

    if (agent.litd_account_id && !agent.litd_account_id.startsWith("pending")) {
      try {
        await litd.updateBalance(agent.litd_account_id, newBudget);
      } catch {}
    }

    emitToUser(req.user.credentialId, "topup_approved", {
      agent_id: agent.id,
      new_balance_sats: newBudget,
    });

    res.json({ ok: true, newBalanceSats: newBudget });
  } catch (err) { next(err); }
});

// ── Approve payment ─────────────────────────────────────────────────────────
router.post("/approve", auth, async (req, res, next) => {
  try {
    const { requestId, approved } = req.body;
    if (!requestId) return res.status(400).json({ error: "requestId required" });

    const status = approved !== false ? "approved" : "denied";
    db.updateApprovalStatus(requestId, status);

    emitToUser(req.user.credentialId, "approval_resolved", {
      approval_id: requestId,
      approved: status === "approved",
    });

    res.json({ ok: true, status });
  } catch (err) { next(err); }
});

// ── Pause ───────────────────────────────────────────────────────────────────
router.post("/pause", auth, async (req, res, next) => {
  try {
    const agent = getUserAgent(req.user.credentialId);
    if (!agent) return res.status(404).json({ error: "No agent found" });

    db.updateAgentStatus(agent.id, "paused");
    emitToUser(req.user.credentialId, "agent_paused", { agent_id: agent.id, status: "paused" });
    res.json({ ok: true, status: "paused" });
  } catch (err) { next(err); }
});

// ── Resume ──────────────────────────────────────────────────────────────────
router.post("/resume", auth, async (req, res, next) => {
  try {
    const agent = getUserAgent(req.user.credentialId);
    if (!agent) return res.status(404).json({ error: "No agent found" });

    db.updateAgentStatus(agent.id, "active");
    emitToUser(req.user.credentialId, "agent_paused", { agent_id: agent.id, status: "active" });
    res.json({ ok: true, status: "active" });
  } catch (err) { next(err); }
});

// ── Update auto-pay limit ───────────────────────────────────────────────────
router.put("/auto-pay-limit", auth, async (req, res, next) => {
  try {
    const { limitSats } = req.body;
    db.default.prepare(
      "UPDATE users SET auto_pay_threshold_sats = ? WHERE credential_id = ?"
    ).run(limitSats, req.user.credentialId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
