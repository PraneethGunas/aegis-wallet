/**
 * Real litd service — account management via litd REST API.
 * Drop-in replacement for mocks/litd.js with identical export signatures.
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

function litdRequest(path, { method = "GET", body, macaroon } = {}) {
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
                json.message || `litd error ${res.statusCode}`
              );
              err.status = res.statusCode;
              reject(err);
            } else {
              resolve(json);
            }
          } catch {
            reject(
              new Error(`Invalid JSON from litd: ${data.slice(0, 200)}`)
            );
          }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Interface matching mocks/litd.js ────────────────────────────────────────

export async function createAccount(budgetSats) {
  const result = await litdRequest("/v1/accounts", {
    method: "POST",
    body: {
      account_balance: String(budgetSats),
    },
  });

  const account = result.account || result;
  return {
    account_id: account.id,
    macaroon: account.macaroon,
    balance_sats: budgetSats,
  };
}

export async function updateBalance(accountId, newBalanceSats) {
  await litdRequest(`/v1/accounts/${accountId}`, {
    method: "PUT",
    body: {
      account_balance: String(newBalanceSats),
    },
  });

  return { success: true, balance_sats: newBalanceSats };
}

export async function freezeAccount(accountId) {
  // litd doesn't have a direct freeze — remove the account to revoke
  try {
    await litdRequest(`/v1/accounts/${accountId}`, {
      method: "DELETE",
    });
    return { success: true };
  } catch {
    return { success: false };
  }
}
