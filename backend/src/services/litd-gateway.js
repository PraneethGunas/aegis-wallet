/**
 * litd account management — drop-in replacement for litd.js.
 * All calls go through the Go sidecar.
 */

const GATEWAY = process.env.LND_GATEWAY_URL || "http://localhost:3003";

async function gw(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${GATEWAY}${path}`, opts);
  const data = await res.json();

  if (data.error) {
    const msg = typeof data.error === "string" ? data.error : data.error.message || JSON.stringify(data.error);
    throw new Error(msg);
  }

  return data;
}

export async function createAccount(budgetSats, label) {
  const data = await gw("POST", "/v1/litd/accounts", { budget_sats: budgetSats, label });
  const acct = data.account || data;
  return {
    account_id: acct.id,
    balance_sats: parseInt(acct.current_balance || acct.initial_balance || "0"),
    macaroon: data.macaroon,
  };
}

export async function getAccountBalance(accountId) {
  const data = await gw("GET", "/v1/litd/accounts");
  const accounts = data.accounts || [];
  const acct = accounts.find((a) => a.id === accountId);
  return {
    balance_sats: acct ? parseInt(acct.current_balance || "0") : 0,
  };
}

export async function updateBalance(accountId, newBalanceSats) {
  const data = await gw("PUT", `/v1/litd/accounts/${accountId}`, { balance_sats: newBalanceSats });
  return { balance_sats: data.balance_sats };
}

export async function listAccounts() {
  const data = await gw("GET", "/v1/litd/accounts");
  return data.accounts || [];
}

export async function freezeAccount(accountId) {
  return gw("DELETE", `/v1/litd/accounts/${accountId}`);
}
