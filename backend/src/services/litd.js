/**
 * litd account management — creates budget-scoped macaroons for agents.
 *
 * Uses lit.macaroon (NOT admin.macaroon) to authenticate with litd's
 * account API on port 8443. Each account gets a scoped macaroon that
 * enforces a spending ceiling at the LND RPC layer.
 *
 * The returned macaroon has permissions:
 *   ✓ offchain:read/write (pay + receive Lightning)
 *   ✓ invoices:read/write
 *   ✓ onchain:read (check balance)
 *   ✗ onchain:write (cannot send on-chain)
 *   ✗ peers, macaroon, channels (cannot modify node)
 *
 * Budget enforcement:
 *   LND RPC middleware intercepts every call made with the account macaroon.
 *   If account.balance < payment amount → RPC rejects BEFORE routing.
 *   No application code can override this — it's cryptographic.
 */
import { readFileSync, existsSync } from "fs";
import https from "https";

const LITD_HOST = process.env.LITD_HOST || "https://localhost:8443";

// litd needs its own macaroon (lit.macaroon), NOT the LND admin macaroon
function loadLitMacaroon() {
  const paths = [
    process.env.LIT_MACAROON_PATH,
    "./certs/lit.macaroon",
  ].filter(Boolean);

  for (const p of paths) {
    if (existsSync(p)) {
      return readFileSync(p).toString("hex");
    }
  }

  // Fallback to admin macaroon (works but not ideal)
  const adminPath = process.env.LND_MACAROON_PATH || "./certs/admin.macaroon";
  if (existsSync(adminPath)) {
    return readFileSync(adminPath).toString("hex");
  }

  throw new Error("No lit.macaroon or admin.macaroon found");
}

let litMacaroon;
try {
  litMacaroon = loadLitMacaroon();
} catch {
  litMacaroon = null;
}

function litdRequest(path, { method = "GET", body } = {}) {
  if (!litMacaroon) throw new Error("litd not configured — no macaroon available");

  const url = new URL(path, LITD_HOST);

  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(url, {
      method,
      rejectUnauthorized: false,
      headers: {
        "Grpc-Metadata-macaroon": litMacaroon,
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(json.message || `litd error ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch {
          reject(new Error(`Invalid JSON from litd: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Account Management ──────────────────────────────────────────────────────

/**
 * Create a litd account with a budget ceiling.
 * Returns: { account_id, macaroon (hex), balance_sats }
 *
 * The returned macaroon is scoped to this account — it can only spend
 * up to the budget. LND enforces this at the RPC layer.
 */
export async function createAccount(budgetSats, label = "") {
  const result = await litdRequest("/v1/accounts", {
    method: "POST",
    body: {
      account_balance: String(budgetSats),
      ...(label ? { label } : {}),
    },
  });

  const account = result.account || result;
  return {
    account_id: account.id,
    macaroon: result.macaroon, // base64 encoded — top-level field, not inside account
    balance_sats: parseInt(account.current_balance || budgetSats),
  };
}

/**
 * Get the real balance of a litd account.
 * This is the cryptographically-enforced number.
 */
export async function getAccountBalance(accountId) {
  const result = await litdRequest("/v1/accounts");
  const accounts = result.accounts || [];
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);

  return {
    balance_sats: parseInt(account.current_balance || "0"),
    initial_balance: parseInt(account.initial_balance || "0"),
    label: account.label || "",
  };
}

/**
 * Update the budget ceiling of a litd account.
 */
export async function updateBalance(accountId, newBalanceSats) {
  const result = await litdRequest(`/v1/accounts/${accountId}`, {
    method: "PUT",
    body: { account_balance: String(newBalanceSats) },
  });

  // Verify the update took effect
  const verified = await getAccountBalance(accountId);
  return { success: true, balance_sats: verified.balance_sats };
}

/**
 * List all litd accounts.
 */
export async function listAccounts() {
  const result = await litdRequest("/v1/accounts");
  return (result.accounts || []).map((a) => ({
    id: a.id,
    balance_sats: parseInt(a.current_balance || "0"),
    initial_balance: parseInt(a.initial_balance || "0"),
    label: a.label || "",
  }));
}

/**
 * Delete a litd account — revokes the macaroon.
 * Any in-flight requests with this macaroon will fail after this.
 */
export async function freezeAccount(accountId) {
  await litdRequest(`/v1/accounts/${accountId}`, { method: "DELETE" });
  return { success: true };
}
