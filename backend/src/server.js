/**
 * Aegis Backend — Express HTTP server + REST routes.
 * Proxies LND/litd operations for the frontend. No database.
 * Run: node src/server.js
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import walletRoutes from "./routes/wallet.js";
import agentRoutes from "./routes/agent.js";
import * as lnd from "./services/lnd-gateway.js";

const PORT = process.env.PORT || 3001;

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

// ── Lightning endpoints ──────────────────────────────────────────────────────

app.post("/ln/fund", async (req, res, next) => {
  try {
    const { psbtHex } = req.body;
    const result = await lnd.publishTransaction(psbtHex);
    res.json({ ok: true, txid: result.txid });
  } catch (err) { next(err); }
});

app.post("/ln/withdraw", async (req, res, next) => {
  try {
    const { address, amountSats } = req.body;
    const result = await lnd.sendCoins(address, amountSats || 0);
    res.json({ ok: true, txid: result.txid });
  } catch (err) { next(err); }
});

app.get("/ln/deposit-address", async (req, res, next) => {
  try {
    const { address } = await lnd.newAddress("TAPROOT_PUBKEY");
    res.json({ address });
  } catch (err) { next(err); }
});

app.post("/ln/open-channel", async (req, res, next) => {
  try {
    const { amountSats } = req.body;

    const walletBal = await lnd.getWalletBalance();
    const confirmed = parseInt(walletBal.confirmed_balance || "0");
    if (confirmed < 20000) {
      return res.status(400).json({
        error: `Need at least 20,000 sats confirmed on-chain. Currently: ${confirmed} sats.`,
      });
    }

    const channelAmount = amountSats || Math.max(20000, confirmed - 5000);
    const peer = lnd.DEFAULT_CHANNEL_PEER;
    await lnd.connectPeer(peer.pubkey, peer.host);
    const result = await lnd.openChannel(peer.pubkey, channelAmount);

    res.json({
      ok: true,
      fundingTxid: result.funding_txid_str || result.transaction_id,
      peerName: peer.name,
      amountSats: channelAmount,
    });
  } catch (err) { next(err); }
});

app.get("/ln/channels", async (req, res, next) => {
  try {
    const [active, pending] = await Promise.all([
      lnd.listChannels().catch(() => ({ channels: [] })),
      lnd.pendingChannels().catch(() => ({})),
    ]);

    res.json({
      channels: (active.channels || []).map((ch) => ({
        channelPoint: ch.channel_point,
        remotePubkey: ch.remote_pubkey,
        localBalance: parseInt(ch.local_balance || "0"),
        remoteBalance: parseInt(ch.remote_balance || "0"),
        capacity: parseInt(ch.capacity || "0"),
        active: ch.active,
      })),
      pending: (pending.pending_open_channels || []).map((p) => ({
        channelPoint: p.channel?.channel_point,
        localBalance: parseInt(p.channel?.local_balance || "0"),
        capacity: parseInt(p.channel?.capacity || "0"),
      })),
    });
  } catch (err) { next(err); }
});

app.get("/ln/status", async (req, res, next) => {
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

// ── Dev endpoint to emit a WS event (for MCP cross-process) ──────────────────
app.post("/dev/emit", (req, res) => {
  const { credential_id, event, data } = req.body;
  // TODO: add IPC_SECRET auth before production
  res.json({ sent: 0 });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack || err.message);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const httpServer = http.createServer(app);

httpServer.listen(PORT, () => {
  console.log(`Aegis backend running on http://localhost:${PORT}`);
});

export { app, httpServer };
