/**
 * Mempool/block explorer client — queries L1 balance directly from the browser.
 * No backend needed. No auth. No secrets.
 *
 * Tries mempool.space first, falls back to blockstream.info.
 * Both support CORS from browser origins.
 */

const APIS = [
  "https://mempool.space/api",
  "https://blockstream.info/api",
];

async function esploraFetch(path) {
  for (const api of APIS) {
    try {
      const res = await fetch(`${api}${path}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Get confirmed + unconfirmed balance for a Bitcoin address.
 */
export async function getAddressBalance(address) {
  const data = await esploraFetch(`/address/${address}`);
  if (!data) return { confirmed_sats: 0, unconfirmed_sats: 0 };

  return {
    confirmed_sats: data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum,
    unconfirmed_sats: data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum,
  };
}

/**
 * Get balance for multiple addresses in parallel.
 */
export async function getMultiAddressBalance(addresses) {
  const results = await Promise.allSettled(
    addresses.map((addr) => getAddressBalance(addr))
  );

  let confirmed = 0;
  let unconfirmed = 0;
  for (const r of results) {
    if (r.status === "fulfilled") {
      confirmed += r.value.confirmed_sats;
      unconfirmed += r.value.unconfirmed_sats;
    }
  }
  return { confirmed_sats: confirmed, unconfirmed_sats: unconfirmed };
}
