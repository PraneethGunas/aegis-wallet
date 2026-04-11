/**
 * Aegis Backend — Express HTTP server + WebSocket + REST routes.
 * Run: node src/server.js
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import jwt from "jsonwebtoken";
import { init as initWs, emitToUser } from "./ws/notifications.js";
import walletRoutes from "./routes/wallet.js";
import agentRoutes from "./routes/agent.js";

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "aegis-dev-secret";

const app = express();
app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── REST routes ───────────────────────────────────────────────────────────────
app.use("/wallet", walletRoutes);
app.use("/agent", agentRoutes);

// ── Lightning endpoints (proxied from frontend) ──────────────────────────────
import * as lnd from "./services/lnd.js";

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

app.post("/ln/fund", authMiddleware, async (req, res, next) => {
  try {
    const { psbtHex } = req.body;
    const result = await lnd.publishTransaction(psbtHex);
    res.json({ ok: true, txid: result.txid });
  } catch (err) { next(err); }
});

app.post("/ln/withdraw", authMiddleware, async (req, res, next) => {
  try {
    const { address, amountSats } = req.body;
    const result = await lnd.sendCoins(address, amountSats || 0);
    res.json({ ok: true, txid: result.txid });
  } catch (err) { next(err); }
});

app.get("/ln/deposit-address", authMiddleware, async (req, res, next) => {
  try {
    const { address } = await lnd.newAddress("TAPROOT_PUBKEY");
    res.json({ address });
  } catch (err) { next(err); }
});

// ── Dev endpoint to emit a WS event (for MCP server cross-process) ───────────
app.post("/dev/emit", (req, res) => {
  const { credential_id, event, data } = req.body;
  const sent = emitToUser(credential_id, event, data);
  res.json({ sent });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack || err.message);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// ── Create HTTP server and attach WebSocket ───────────────────────────────────
const httpServer = http.createServer(app);

function authenticateWsToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { credential_id: decoded.credentialId };
  } catch {
    return null;
  }
}

initWs(httpServer, authenticateWsToken);

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`Aegis backend running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws?token=<jwt>`);
});

export { app, httpServer };
