/**
 * Aegis Backend — Express HTTP server + WebSocket.
 * Run: node src/server.js
 */
import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { init as initWs, emitToUser } from "./ws/notifications.js";
import * as db from "./mocks/db.js";
import * as lnd from "./mocks/lnd.js";

const PORT = process.env.PORT || 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, "../../web");
const DEMO_TOKEN = "test_token_123";
const FUNDING_BALANCE_SATS = 125000;

const app = express();
app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Test endpoint to emit a WS event (dev only) ──────────────────────────────
app.post("/dev/emit", (req, res) => {
  const { credential_id, event, data } = req.body;
  const sent = emitToUser(credential_id, event, data);
  res.json({ sent });
});

app.get("/api/demo/dashboard", async (req, res) => {
  const agent = db.getAgent(DEMO_TOKEN);

  if (!agent) {
    return res.status(404).json({ error: "Demo agent not found" });
  }

  const [{ balance_sats }, user] = await Promise.all([
    lnd.getBalance(agent.macaroon_encrypted),
    Promise.resolve(db.getUser(agent.user_credential_id)),
  ]);

  res.json({
    wallet: {
      funding_balance_sats: FUNDING_BALANCE_SATS,
      spending_balance_sats: balance_sats,
      total_balance_sats: FUNDING_BALANCE_SATS + balance_sats,
      auto_pay_threshold_sats: user?.auto_pay_threshold_sats ?? 15000,
      spent_today_sats: db.getAgentSpendingToday(agent.id).total_sats,
    },
    agent: {
      id: agent.id,
      label: "Claude Agent",
      status: agent.status,
      budget_sats: agent.budget_sats,
      credential_id: agent.user_credential_id,
    },
    payments: db.getTransactions(agent.id, 8),
    audit: db.getAuditLog(agent.id, 8),
  });
});

app.use(express.static(webDir));

// ── Create HTTP server and attach WebSocket ───────────────────────────────────
const httpServer = http.createServer(app);

// Simple token auth for WS (mock — accepts "ws_user_1" → credential_id "user_1")
function authenticateWsToken(token) {
  // In production, validate JWT or session token here
  if (token === "ws_user_1") return { credential_id: "user_1" };
  if (token === "ws_user_2") return { credential_id: "user_2" };
  return null;
}

initWs(httpServer, authenticateWsToken);

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`Aegis backend running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws?token=<token>`);
});

export { app, httpServer };
