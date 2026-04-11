/**
 * Aegis Backend — Express HTTP server + WebSocket.
 * Run: node src/server.js
 */
import express from "express";
import cors from "cors";
import http from "http";
import { init as initWs, emitToUser } from "./ws/notifications.js";

const PORT = process.env.PORT || 3001;

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
