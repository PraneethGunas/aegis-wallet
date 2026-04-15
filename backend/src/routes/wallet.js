/**
 * Wallet REST routes — balance, BTC price, history.
 * No database — L1 balance from mempool (frontend-side),
 * L2 balance and history from LND via Go gateway.
 */
import { Router } from "express";
import * as lnd from "../services/lnd-gateway.js";

// BTC price cache — proxied to avoid CORS
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

// ── BTC Price (no auth, public data) ────────────────────────────────────────
router.get("/btc-price", async (req, res) => {
  const btcPrice = await getBtcPrice();
  res.json({ btcPrice });
});

// ── L2 Balance (Lightning via LND) ──────────────────────────────────────────
router.get("/l2-balance", async (req, res, next) => {
  try {
    const l2Result = await lnd.getBalance().catch(() => ({ balance_sats: 0 }));
    res.json({ l2Sats: parseInt(l2Result.balance_sats || "0") });
  } catch (err) { next(err); }
});

// ── History (Lightning payments from LND) ───────────────────────────────────
router.get("/history", async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    const transactions = [];

    // Lightning payments from LND
    try {
      const lnPayments = await lnd.listPayments(null, limit);
      for (const p of lnPayments) {
        transactions.push({
          id: `ln_${p.timestamp}`,
          type: "send",
          description: "Lightning payment",
          amount: -p.amount_sats,
          amountSats: p.amount_sats,
          isAgent: false,
          txid: null,
          timestamp: new Date(p.timestamp * 1000).toISOString(),
        });
      }
    } catch {}

    transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({ transactions: transactions.slice(0, limit) });
  } catch (err) { next(err); }
});

// ── Receive (generate Lightning invoice) ────────────────────────────────────
router.post("/receive", async (req, res, next) => {
  try {
    const { amount_sats, memo } = req.body;
    const invoice = await lnd.addInvoice(amount_sats || 1000, memo || "Aegis wallet");
    res.json(invoice);
  } catch (err) { next(err); }
});

// ── Funding address (LND on-chain for L1→L2) ───────────────────────────────
router.get("/funding-address", async (req, res, next) => {
  try {
    const { address } = await lnd.newAddress("TAPROOT_PUBKEY");
    res.json({ address });
  } catch (err) { next(err); }
});

export default router;
