/**
 * Wallet REST routes — registration, balance, send, receive, history, settings.
 *
 * L1 (savings): self-custodial Taproot address → queried via mempool.space
 * L2 (agent budget): custodial Lightning via LND/litd
 */
import { Router } from "express";
import jwt from "jsonwebtoken";
import * as lnd from "../services/lnd.js";
import * as mempool from "../services/mempool.js";
import * as db from "../db/index.js";

// BTC price cache — avoids CoinGecko rate limits and timeouts
let priceCache = { usd: 0, fetchedAt: 0 };
async function getBtcPrice() {
  if (Date.now() - priceCache.fetchedAt < 30_000 && priceCache.usd > 0) {
    return priceCache.usd;
  }
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    if (data?.bitcoin?.usd) {
      priceCache = { usd: data.bitcoin.usd, fetchedAt: Date.now() };
      return data.bitcoin.usd;
    }
  } catch {}
  return priceCache.usd || 0;
}

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
// L1 = user's self-custodial Taproot addresses (via mempool.space)
// L2 = LND Lightning channels (via litd)
// Accepts comma-separated addresses to aggregate across all derived indices
router.get("/balance", auth, async (req, res, next) => {
  try {
    const addressParam = req.query.address || "";
    const addresses = addressParam.split(",").filter(Boolean);

    // Query all L1 addresses in parallel
    const l1Results = await Promise.allSettled(
      addresses.map((addr) => mempool.getAddressBalance(addr))
    );

    let l1Sats = 0;
    let l1Unconfirmed = 0;
    for (const r of l1Results) {
      if (r.status === "fulfilled" && r.value) {
        l1Sats += r.value.confirmed_sats;
        l1Unconfirmed += r.value.unconfirmed_sats;
      }
    }

    const [l2Result, btcPrice] = await Promise.all([
      lnd.getBalance().catch(() => ({ balance_sats: 0 })),
      getBtcPrice(),
    ]);

    const l2Sats = parseInt(l2Result.balance_sats || "0");

    const totalSats = l1Sats + l2Sats;
    res.json({
      l1Sats,
      l1Unconfirmed,
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
// L1 on-chain txs from mempool.space, L2 Lightning from LND, agent txs from DB
router.get("/history", auth, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const addressParam = req.query.address || "";
    const addresses = addressParam.split(",").filter(Boolean);
    const transactions = [];

    // 1. L1 on-chain transactions from mempool.space (all derived addresses)
    for (const address of addresses) {
      try {
        const onchainTxs = await mempool.getAddressTransactions(address);
        for (const tx of onchainTxs) {
          transactions.push({
            id: `onchain_${tx.txid}`,
            type: tx.direction,
            description: tx.direction === "receive" ? "Received on-chain" : "Sent on-chain",
            amount: tx.direction === "receive" ? tx.amount_sats : -tx.amount_sats,
            amountSats: tx.amount_sats,
            isAgent: false,
            approvalType: null,
            txid: tx.txid,
            timestamp: tx.timestamp,
            confirmations: tx.confirmed ? 1 : 0,
            fee: tx.fee,
          });
        }
      } catch {}
    }

    // 2. Agent transactions from our DB (MCP tool payments)
    const dbTxs = db.getTransactions(null, limit) || [];
    for (const tx of dbTxs) {
      transactions.push({
        id: `db_${tx.id}`,
        type: tx.agent_id ? "agent" : tx.type === "payment" ? "send" : tx.type,
        description: tx.purpose || `${tx.type} ${tx.amount_sats} sats`,
        amount: tx.type === "invoice" ? tx.amount_sats : -tx.amount_sats,
        amountSats: tx.amount_sats,
        isAgent: !!tx.agent_id,
        approvalType: tx.approval_type,
        txid: tx.payment_hash,
        timestamp: tx.created_at,
      });
    }

    // 3. L2 Lightning payments from LND
    try {
      const lnPayments = await lnd.listPayments(null, limit);
      for (const p of lnPayments) {
        if (transactions.some((t) => t.txid === p.payment_hash)) continue;
        transactions.push({
          id: `ln_${p.timestamp}`,
          type: "send",
          description: "Lightning payment",
          amount: -p.amount_sats,
          amountSats: p.amount_sats,
          isAgent: false,
          approvalType: null,
          txid: null,
          timestamp: p.timestamp,
        });
      }
    } catch {}

    transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({ transactions: transactions.slice(0, limit) });
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
// Returns UTXOs for the user's self-custodial Taproot address via mempool.space
router.get("/utxos", auth, async (req, res, next) => {
  try {
    const address = req.query.address;
    if (!address) return res.status(400).json({ error: "address query param required" });

    const utxos = await mempool.getAddressUtxos(address);
    res.json({ utxos });
  } catch (err) { next(err); }
});

export default router;
