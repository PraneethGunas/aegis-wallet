/**
 * Block explorer API client — queries the user's self-custodial L1 address.
 *
 * Tries multiple APIs with fallback:
 * 1. mempool.space (Esplora API)
 * 2. blockstream.info (Esplora API — same format)
 * 3. blockchain.info (different format — custom parser)
 *
 * No custody involved — read-only block explorer queries.
 */

// Esplora-compatible APIs (same response format)
const ESPLORA_APIS = [
  process.env.MEMPOOL_API || "https://mempool.space/api",
  "https://blockstream.info/api",
];

async function esploraRequest(path) {
  let lastErr;
  for (const api of ESPLORA_APIS) {
    try {
      const res = await fetch(`${api}${path}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) { lastErr = new Error(`${api}: ${res.status}`); continue; }
      return await res.json();
    } catch (err) { lastErr = err; }
  }
  return null; // All Esplora APIs failed — caller falls back to blockchain.info
}

async function blockchainInfoRequest(path) {
  const res = await fetch(`https://blockchain.info${path}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`blockchain.info: ${res.status}`);
  return res.json();
}

/**
 * Get address balance (confirmed + unconfirmed).
 */
export async function getAddressBalance(address) {
  // Try Esplora first
  const data = await esploraRequest(`/address/${address}`);
  if (data) {
    return {
      confirmed_sats: data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum,
      unconfirmed_sats: data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum,
      total_sats: (data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum) +
                  (data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum),
    };
  }

  // Fallback: blockchain.info
  const bcData = await blockchainInfoRequest(`/rawaddr/${address}`);
  return {
    confirmed_sats: bcData.final_balance,
    unconfirmed_sats: 0,
    total_sats: bcData.final_balance,
  };
}

/**
 * Get UTXOs for an address (for PSBT construction).
 */
export async function getAddressUtxos(address) {
  // Try Esplora first
  const data = await esploraRequest(`/address/${address}/utxo`);
  if (data) {
    return data.map((u) => ({
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      confirmed: u.status.confirmed,
      block_height: u.status.block_height || null,
    }));
  }

  // Fallback: blockchain.info — extract unspent from full address data
  const bcData = await blockchainInfoRequest(`/unspent?active=${address}&confirmations=0`);
  return (bcData.unspent_outputs || []).map((u) => ({
    txid: u.tx_hash_big_endian,
    vout: u.tx_output_n,
    value: u.value,
    confirmed: u.confirmations > 0,
    block_height: null,
  }));
}

/**
 * Get transaction history for an address.
 */
export async function getAddressTransactions(address) {
  // Try Esplora first
  const data = await esploraRequest(`/address/${address}/txs`);
  if (data) {
    return data.map((tx) => {
      let received = 0, sent = 0;
      for (const vout of tx.vout) {
        if (vout.scriptpubkey_address === address) received += vout.value;
      }
      for (const vin of tx.vin) {
        if (vin.prevout?.scriptpubkey_address === address) sent += vin.prevout.value;
      }
      const netAmount = received - sent;
      return {
        txid: tx.txid,
        amount_sats: Math.abs(netAmount),
        direction: netAmount >= 0 ? "receive" : "send",
        confirmed: tx.status.confirmed,
        timestamp: tx.status.block_time
          ? new Date(tx.status.block_time * 1000).toISOString()
          : new Date().toISOString(),
        fee: tx.fee,
      };
    });
  }

  // Fallback: blockchain.info
  const bcData = await blockchainInfoRequest(`/rawaddr/${address}`);
  return (bcData.txs || []).map((tx) => ({
    txid: tx.hash,
    amount_sats: Math.abs(tx.result),
    direction: tx.result >= 0 ? "receive" : "send",
    confirmed: tx.block_height > 0,
    timestamp: new Date(tx.time * 1000).toISOString(),
    fee: tx.fee,
  }));
}
