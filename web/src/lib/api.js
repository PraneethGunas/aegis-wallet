/**
 * REST API client for Aegis backend
 *
 * Base URL from NEXT_PUBLIC_API_URL env var
 * Auto-attaches auth token from WebAuthn session
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function request(path, options = {}) {
  // TODO: Implement with auth token attachment
  // - 401 → re-authenticate via passkey
  // - 5xx → retry with backoff
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}

// Wallet endpoints
export const wallet = {
  create: (credentialId, publicKey) =>
    request("/wallet/create", { method: "POST", body: JSON.stringify({ credentialId, publicKey }) }),
  getBalance: () => request("/wallet/balance"),
  getHistory: () => request("/wallet/history"),
  send: (txHex) =>
    request("/wallet/send", { method: "POST", body: JSON.stringify({ txHex }) }),
  receive: (type, options) =>
    request("/wallet/receive", { method: "POST", body: JSON.stringify({ type, ...options }) }),
};

// Agent endpoints
export const agent = {
  create: () => request("/agent/create", { method: "POST" }),
  pair: () => request("/agent/pair", { method: "POST" }),
  topup: (amountSats) =>
    request("/agent/topup", { method: "POST", body: JSON.stringify({ amountSats }) }),
  pause: () => request("/agent/pause", { method: "POST" }),
  status: () => request("/agent/status"),
  approve: (requestId, approved) =>
    request("/agent/approve", { method: "POST", body: JSON.stringify({ requestId, approved }) }),
};

// Lightning endpoints
export const ln = {
  fund: (psbt) =>
    request("/ln/fund", { method: "POST", body: JSON.stringify({ psbt }) }),
  withdraw: (address) =>
    request("/ln/withdraw", { method: "POST", body: JSON.stringify({ address }) }),
};
