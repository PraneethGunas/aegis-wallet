/**
 * REST API client for Aegis backend.
 * No auth — user's own node, macaroon is the credential.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = `API error: ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {}
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return null;
  return res.json();
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Wallet
export const wallet = {
  getL2Balance: () => request("/wallet/l2-balance"),
  getBtcPrice: () => request("/wallet/btc-price"),
  getHistory: (limit = 200) => request(`/wallet/history?limit=${limit}`),
  receive: (amount_sats, memo) =>
    request("/wallet/receive", { method: "POST", body: JSON.stringify({ amount_sats, memo }) }),
  getFundingAddress: () => request("/wallet/funding-address"),
};

// Agent
export const agent = {
  create: (budgetSats) =>
    request("/agent/create", { method: "POST", body: JSON.stringify({ budgetSats }) }),
  status: () => request("/agent/status"),
  updateBudget: (budgetSats, accountId) =>
    request("/agent/budget", { method: "POST", body: JSON.stringify({ budgetSats, accountId }) }),
  payDirect: (bolt11) =>
    request("/agent/pay-direct", { method: "POST", body: JSON.stringify({ bolt11 }) }),
  getPendingInvoices: () => request("/agent/webhook/pending"),
  clearPendingInvoice: (bolt11) =>
    request("/agent/webhook/clear", { method: "POST", body: JSON.stringify({ bolt11 }) }),
  revoke: (accountId) =>
    request("/agent/revoke", { method: "POST", body: JSON.stringify({ accountId }) }),
};

// Lightning
export const ln = {
  fund: (psbtHex) =>
    request("/ln/fund", { method: "POST", body: JSON.stringify({ psbtHex }) }),
  withdraw: (address, amountSats) =>
    request("/ln/withdraw", { method: "POST", body: JSON.stringify({ address, amountSats }) }),
  getDepositAddress: () => request("/ln/deposit-address"),
  openChannel: (amountSats) =>
    request("/ln/open-channel", { method: "POST", body: JSON.stringify({ amountSats }) }),
  getChannels: () => request("/ln/channels"),
  getNodeStatus: () => request("/ln/status"),
};
