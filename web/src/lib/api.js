/**
 * REST API client for Aegis backend
 *
 * Base URL from NEXT_PUBLIC_API_URL env var
 * Auto-attaches auth token from session
 * Handles 401 by clearing session (caller re-authenticates)
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

let authToken = null;

/**
 * Set the auth token (called after passkey authentication).
 */
export function setAuthToken(token) {
  authToken = token;
  if (token) {
    sessionStorage.setItem("aegis_auth_token", token);
  } else {
    sessionStorage.removeItem("aegis_auth_token");
  }
}

/**
 * Get the current auth token (restores from sessionStorage if needed).
 */
export function getAuthToken() {
  if (!authToken) {
    authToken = sessionStorage.getItem("aegis_auth_token");
  }
  return authToken;
}

/**
 * Core request helper with auth and error handling.
 */
async function request(path, options = {}) {
  const token = getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Clear stale token — caller should re-authenticate
    setAuthToken(null);
    throw new ApiError("Session expired. Please authenticate again.", 401);
  }

  if (!res.ok) {
    let message = `API error: ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      // Response wasn't JSON
    }
    throw new ApiError(message, res.status);
  }

  // Handle 204 No Content
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

// Wallet endpoints
export const wallet = {
  create: (credentialId, publicKey) =>
    request("/wallet/create", {
      method: "POST",
      body: JSON.stringify({ credentialId, publicKey }),
    }),

  getBalance: () => request("/wallet/balance"),

  getHistory: (limit = 20) => request(`/wallet/history?limit=${limit}`),

  send: (txHex) =>
    request("/wallet/send", {
      method: "POST",
      body: JSON.stringify({ txHex }),
    }),

  receive: (type, options = {}) =>
    request("/wallet/receive", {
      method: "POST",
      body: JSON.stringify({ type, ...options }),
    }),

  getFundingAddress: () => request("/wallet/funding-address"),

  getUtxos: () => request("/wallet/utxos"),
};

// Agent endpoints
export const agent = {
  create: (budgetSats, autoPayLimitSats) =>
    request("/agent/create", {
      method: "POST",
      body: JSON.stringify({ budgetSats, autoPayLimitSats }),
    }),

  pair: () => request("/agent/pair", { method: "POST" }),

  topup: (amountSats) =>
    request("/agent/topup", {
      method: "POST",
      body: JSON.stringify({ amountSats }),
    }),

  pause: () => request("/agent/pause", { method: "POST" }),

  resume: () => request("/agent/resume", { method: "POST" }),

  status: () => request("/agent/status"),

  approve: (requestId, approved) =>
    request("/agent/approve", {
      method: "POST",
      body: JSON.stringify({ requestId, approved }),
    }),

  updateAutoPayLimit: (limitSats) =>
    request("/agent/auto-pay-limit", {
      method: "PUT",
      body: JSON.stringify({ limitSats }),
    }),
};

// Lightning endpoints
export const ln = {
  fund: (psbtHex) =>
    request("/ln/fund", {
      method: "POST",
      body: JSON.stringify({ psbtHex }),
    }),

  withdraw: (address, amountSats) =>
    request("/ln/withdraw", {
      method: "POST",
      body: JSON.stringify({ address, amountSats }),
    }),

  getDepositAddress: () => request("/ln/deposit-address"),
};
