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
import * as lnd from "./services/lnd-gateway.js";

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

// ── Channel operations ────────────────────────────────────────────────────────

app.post("/ln/open-channel", authMiddleware, async (req, res, next) => {
  try {
    const { amountSats } = req.body;

    // Check on-chain balance
    const walletBal = await lnd.getWalletBalance();
    const confirmed = parseInt(walletBal.confirmed_balance || "0");
    if (confirmed < 20000) {
      return res.status(400).json({
        error: `Need at least 20,000 sats confirmed on-chain. Currently: ${confirmed} sats.`,
      });
    }

    const channelAmount = amountSats || Math.max(20000, confirmed - 5000); // reserve for fees

    // Connect to peer
    const peer = lnd.DEFAULT_CHANNEL_PEER;
    await lnd.connectPeer(peer.pubkey, peer.host);

    // Open channel
    const result = await lnd.openChannel(peer.pubkey, channelAmount);

    const fundingTxid = result.funding_txid_str || result.transaction_id;

    // Notify frontend
    emitToUser(req.user.credentialId, "channel_opening", {
      fundingTxid,
      peerName: peer.name,
      amountSats: channelAmount,
    });

    // Background poll for channel confirmation
    const pollInterval = setInterval(async () => {
      try {
        const { channels } = await lnd.listChannels();
        const active = channels?.find(
          (ch) => ch.channel_point?.startsWith(fundingTxid)
        );
        if (active) {
          clearInterval(pollInterval);
          emitToUser(req.user.credentialId, "channel_confirmed", {
            channelId: active.chan_id,
            localBalance: parseInt(active.local_balance || "0"),
            peerName: peer.name,
          });
        }
      } catch {}
    }, 30000);

    // Cap polling at 60 minutes
    setTimeout(() => clearInterval(pollInterval), 60 * 60 * 1000);

    res.json({
      ok: true,
      fundingTxid,
      peerName: peer.name,
      amountSats: channelAmount,
    });
  } catch (err) { next(err); }
});

app.get("/ln/channels", authMiddleware, async (req, res, next) => {
  try {
    const [active, pending] = await Promise.all([
      lnd.listChannels().catch(() => ({ channels: [] })),
      lnd.pendingChannels().catch(() => ({})),
    ]);

    const channels = (active.channels || []).map((ch) => ({
      channelPoint: ch.channel_point,
      remotePubkey: ch.remote_pubkey,
      localBalance: parseInt(ch.local_balance || "0"),
      remoteBalance: parseInt(ch.remote_balance || "0"),
      capacity: parseInt(ch.capacity || "0"),
      active: ch.active,
    }));

    const pendingOpen = (pending.pending_open_channels || []).map((p) => ({
      channelPoint: p.channel?.channel_point,
      localBalance: parseInt(p.channel?.local_balance || "0"),
      capacity: parseInt(p.channel?.capacity || "0"),
      confirmationsNeeded: p.confirmations_left,
    }));

    res.json({ channels, pending: pendingOpen });
  } catch (err) { next(err); }
});

app.get("/ln/status", authMiddleware, async (req, res, next) => {
  try {
    const [info, walletBal, chanBal, channels, pending] = await Promise.allSettled([
      lnd.getInfo(),
      lnd.getWalletBalance(),
      lnd.getBalance(),
      lnd.listChannels(),
      lnd.pendingChannels(),
    ]);

    res.json({
      syncedToChain: info.value?.is_synced_to_chain ?? false,
      numPeers: info.value?.peers_count ?? 0,
      onchainConfirmedSats: parseInt(walletBal.value?.confirmed_balance || "0"),
      onchainUnconfirmedSats: parseInt(walletBal.value?.unconfirmed_balance || "0"),
      channelBalanceSats: chanBal.value?.balance_sats ?? 0,
      activeChannels: (channels.value?.channels || []).length,
      pendingChannels: (pending.value?.pending_open_channels || []).length,
    });
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
