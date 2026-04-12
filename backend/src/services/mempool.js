/**
 * Mempool.space API client — queries the user's self-custodial L1 address.
 *
 * This is NOT LND's wallet. This is the passkey-derived Taproot address
 * that the user controls directly. Mempool.space provides:
 * - Address balance (confirmed + unconfirmed)
 * - UTXOs (for client-side PSBT construction)
 * - Transaction history
 *
 * No custody involved — mempool.space is a read-only block explorer API.
 */

const APIS = [
  process.env.MEMPOOL_API || "https://mempool.space/api",
  "https://blockstream.info/api",
];

async function mempoolRequest(path) {
  let lastErr;
  for (const api of APIS) {
    try {
      const res = await fetch(`${api}${path}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        lastErr = new Error(`${api}: ${res.status} ${res.statusText}`);
        continue;
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("All block explorer APIs failed");
}

/**
 * Get address balance (confirmed + unconfirmed).
 */
export async function getAddressBalance(address) {
  const data = await mempoolRequest(`/address/${address}`);
  const confirmed = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
  const unconfirmed = data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum;

  return {
    confirmed_sats: confirmed,
    unconfirmed_sats: unconfirmed,
    total_sats: confirmed + unconfirmed,
  };
}

/**
 * Get UTXOs for an address (for PSBT construction).
 * Returns array of { txid, vout, value, confirmed }.
 */
export async function getAddressUtxos(address) {
  const utxos = await mempoolRequest(`/address/${address}/utxo`);
  return utxos.map((u) => ({
    txid: u.txid,
    vout: u.vout,
    value: u.value,
    confirmed: u.status.confirmed,
    block_height: u.status.block_height || null,
  }));
}

/**
 * Get transaction history for an address.
 * Returns most recent transactions first.
 */
export async function getAddressTransactions(address) {
  const txs = await mempoolRequest(`/address/${address}/txs`);
  return txs.map((tx) => {
    // Calculate net amount for this address
    let received = 0;
    let sent = 0;
    for (const vout of tx.vout) {
      if (vout.scriptpubkey_address === address) {
        received += vout.value;
      }
    }
    for (const vin of tx.vin) {
      if (vin.prevout?.scriptpubkey_address === address) {
        sent += vin.prevout.value;
      }
    }
    const netAmount = received - sent;

    return {
      txid: tx.txid,
      amount_sats: Math.abs(netAmount),
      direction: netAmount >= 0 ? "receive" : "send",
      confirmed: tx.status.confirmed,
      block_height: tx.status.block_height || null,
      block_time: tx.status.block_time || null,
      timestamp: tx.status.block_time
        ? new Date(tx.status.block_time * 1000).toISOString()
        : new Date().toISOString(),
      fee: tx.fee,
    };
  });
}
