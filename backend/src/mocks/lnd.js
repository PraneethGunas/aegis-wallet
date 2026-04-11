/**
 * Mock LND service — simulates payment operations.
 * Replace with real lnd.js (Person 1) when ready.
 */

let mockBalance = 50000; // sats

export async function sendPayment(bolt11, macaroon) {
  const decoded = await decodeInvoice(bolt11);

  if (decoded.is_expired) {
    return { success: false, error: "invoice_expired" };
  }

  if (decoded.amount_sats > mockBalance) {
    return {
      success: false,
      error: "insufficient_balance",
      balance_sats: mockBalance,
      invoice_amount_sats: decoded.amount_sats,
    };
  }

  mockBalance -= decoded.amount_sats;
  const fee = Math.ceil(decoded.amount_sats * 0.001); // 0.1% fee
  mockBalance -= fee;

  return {
    success: true,
    amount_sats: decoded.amount_sats,
    fee_sats: fee,
    preimage: randomHex(32),
    balance_remaining_sats: mockBalance,
  };
}

export async function decodeInvoice(bolt11) {
  // Extract a fake amount from the invoice string, or default to 10000
  const amount = extractMockAmount(bolt11);
  return {
    amount_sats: amount,
    description: "Mock invoice",
    expiry_seconds: 900,
    is_expired: false,
  };
}

export async function addInvoice(amountSats, memo, macaroon) {
  return {
    bolt11: `lnbc${amountSats}n1mock${randomHex(16)}`,
    payment_hash: randomHex(32),
    expires_at: new Date(Date.now() + 900_000).toISOString(),
  };
}

export async function getBalance(macaroon) {
  return { balance_sats: mockBalance };
}

export async function listPayments(macaroon, limit = 10) {
  // Return some mock history
  return [
    { amount_sats: 5000, fee_sats: 5, status: "settled", timestamp: new Date(Date.now() - 3600_000).toISOString() },
    { amount_sats: 3000, fee_sats: 3, status: "settled", timestamp: new Date(Date.now() - 7200_000).toISOString() },
  ].slice(0, limit);
}

// Reset for testing
export function _resetBalance(sats = 50000) {
  mockBalance = sats;
}

function randomHex(bytes) {
  return Array.from({ length: bytes }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0")
  ).join("");
}

function extractMockAmount(bolt11) {
  // Try to pull a number out of the string, otherwise default
  const match = bolt11.match(/lnbc(\d+)/);
  return match ? parseInt(match[1], 10) : 10000;
}
