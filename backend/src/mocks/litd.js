/**
 * Mock litd service — simulates account management.
 * Replace with real litd.js (Person 1) when ready.
 */

const accounts = new Map();

export async function createAccount(budgetSats) {
  const id = `acc_${Date.now()}`;
  const macaroon = `mock_mac_${randomHex(16)}`;
  accounts.set(id, { balance_sats: budgetSats });
  return { account_id: id, macaroon, balance_sats: budgetSats };
}

export async function updateBalance(accountId, newBalanceSats) {
  const acc = accounts.get(accountId) || { balance_sats: 0 };
  acc.balance_sats = newBalanceSats;
  accounts.set(accountId, acc);
  return { success: true, balance_sats: newBalanceSats };
}

export async function freezeAccount(accountId) {
  return { success: true };
}

function randomHex(bytes) {
  return Array.from({ length: bytes }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0")
  ).join("");
}
