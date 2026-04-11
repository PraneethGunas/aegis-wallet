/**
 * Real LND service — connects to litd REST API via HTTPS.
 * Drop-in replacement for mocks/lnd.js with identical export signatures.
 */
import { readFileSync } from "fs";
import https from "https";

const LITD_HOST = process.env.LITD_HOST || "https://localhost:8443";

function readMacaroon(path) {
  return readFileSync(path).toString("hex");
}

const adminMacaroon = readMacaroon(
  process.env.LND_MACAROON_PATH || "./certs/admin.macaroon"
);

function lndRequest(path, { method = "GET", body, macaroon } = {}) {
  const mac = macaroon || adminMacaroon;
  const url = new URL(path, LITD_HOST);

  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      url,
      {
        method,
        rejectUnauthorized: false,
        headers: {
          "Grpc-Metadata-macaroon": mac,
          "Content-Type": "application/json",
          ...(payload
            ? { "Content-Length": Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 400) {
              const err = new Error(
                json.message || `LND error ${res.statusCode}`
              );
              err.status = res.statusCode;
              err.lndError = json;
              reject(err);
            } else {
              resolve(json);
            }
          } catch {
            reject(new Error(`Invalid JSON from LND: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Interface matching mocks/lnd.js ─────────────────────────────────────────

export async function sendPayment(bolt11, macaroon) {
  try {
    const result = await lndRequest("/v1/channels/transactions", {
      method: "POST",
      body: { payment_request: bolt11 },
      macaroon,
    });

    if (result.payment_error) {
      return {
        success: false,
        error: result.payment_error,
      };
    }

    const amountSats = parseInt(result.payment_route?.total_amt || "0");
    const feeSats = parseInt(result.payment_route?.total_fees || "0");

    // Get updated balance
    const { balance_sats } = await getBalance(macaroon);

    return {
      success: true,
      amount_sats: amountSats,
      fee_sats: feeSats,
      preimage: result.payment_preimage,
      balance_remaining_sats: balance_sats,
    };
  } catch (err) {
    return {
      success: false,
      error: err.lndError?.message || err.message,
    };
  }
}

export async function decodeInvoice(bolt11) {
  if (!bolt11 || (!bolt11.startsWith("lnbc") && !bolt11.startsWith("lntb"))) {
    return {
      is_valid: false,
      error: "not a Lightning invoice — must start with 'lnbc' (mainnet) or 'lntb' (testnet)",
    };
  }

  try {
    const decoded = await lndRequest(`/v1/payreq/${bolt11}`);
    const expiry = parseInt(decoded.expiry || "3600");
    const timestamp = parseInt(decoded.timestamp || "0");
    const expiresAt = timestamp + expiry;
    const isExpired = expiresAt < Math.floor(Date.now() / 1000);

    return {
      is_valid: true,
      is_expired: isExpired,
      payment_hash: decoded.payment_hash,
      amount_sats: parseInt(decoded.num_satoshis || "0"),
      description: decoded.description || "",
      expiry_seconds: expiry,
    };
  } catch (err) {
    return {
      is_valid: false,
      error: err.message,
    };
  }
}

export async function addInvoice(amountSats, memo, macaroon) {
  const result = await lndRequest("/v1/invoices", {
    method: "POST",
    body: { value: String(amountSats), memo },
    macaroon,
  });

  return {
    bolt11: result.payment_request,
    payment_hash: result.r_hash,
    expires_at: new Date(
      Date.now() + 900_000
    ).toISOString(),
  };
}

export async function getBalance(macaroon) {
  const result = await lndRequest("/v1/balance/channels", { macaroon });
  return {
    balance_sats: parseInt(result.local_balance?.sat || "0"),
  };
}

export async function listPayments(macaroon, limit = 10) {
  const result = await lndRequest(
    `/v1/payments?include_incomplete=false&max_payments=${limit}`,
    { macaroon }
  );

  return (result.payments || []).map((p) => ({
    amount_sats: parseInt(p.value_sat || "0"),
    fee_sats: parseInt(p.fee_sat || "0"),
    status: p.status === "SUCCEEDED" ? "settled" : p.status?.toLowerCase(),
    timestamp: new Date(parseInt(p.creation_date) * 1000).toISOString(),
  }));
}

// ── Additional endpoints for wallet routes ──────────────────────────────────

export async function getWalletBalance() {
  return lndRequest("/v1/balance/blockchain");
}

export async function payInvoiceSync(bolt11, macaroon) {
  return lndRequest("/v1/channels/transactions", {
    method: "POST",
    body: { payment_request: bolt11 },
    macaroon,
  });
}

export async function newAddress(type = "TAPROOT_PUBKEY") {
  return lndRequest("/v1/newaddress", {
    method: "POST",
    body: { type },
  });
}

export async function sendCoins(address, amountSats) {
  return lndRequest("/v1/transactions", {
    method: "POST",
    body: { addr: address, amount: String(amountSats) },
  });
}

export async function publishTransaction(txHex) {
  return lndRequest("/v2/wallet/tx", {
    method: "POST",
    body: { tx_hex: txHex },
  });
}

export async function listUnspent() {
  return lndRequest("/v1/utxos", {
    method: "POST",
    body: { min_confs: 1, max_confs: 999999 },
  });
}

export async function getInfo() {
  return lndRequest("/v1/getinfo");
}
