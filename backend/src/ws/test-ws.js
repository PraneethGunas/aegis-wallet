/**
 * Test WebSocket server — validates auth, per-user routing, event delivery.
 * Run: node src/ws/test-ws.js
 */
import http from "http";
import express from "express";
import WebSocket from "ws";
import { init, emitToUser, getConnectionCount } from "./notifications.js";

let passed = 0;
let failed = 0;

function check(name, condition, data) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    if (data !== undefined) console.log(`     Got:`, typeof data === "string" ? data : JSON.stringify(data));
    failed++;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function connectWs(port, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws?token=${token}`);
    const messages = [];
    ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
    ws.on("open", () => resolve({ ws, messages }));
    ws.on("error", reject);
  });
}

function connectWsExpectClose(port, token) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws?token=${token}`);
    ws.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
    ws.on("error", () => {}); // swallow
  });
}

async function main() {
  console.log("═══ Task 4: WebSocket Server Tests ═══\n");

  // Start a test server
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = 9876;

  function authenticate(token) {
    if (token === "user1_tok") return { credential_id: "user_1" };
    if (token === "user2_tok") return { credential_id: "user_2" };
    return null;
  }

  init(httpServer, authenticate);
  await new Promise((r) => httpServer.listen(PORT, r));

  // ── Test 1: Invalid token → disconnected ──────────────────────────────
  console.log("── Invalid token ──");
  const closed = await connectWsExpectClose(PORT, "bad_token");
  check("invalid token → close code 4001", closed.code === 4001, closed);

  // ── Test 2: No token → disconnected ───────────────────────────────────
  console.log("\n── Missing token ──");
  const noToken = await connectWsExpectClose(PORT, "");
  check("missing token → close code 4001", noToken.code === 4001, noToken);

  // ── Test 3: Valid connection + welcome message ────────────────────────
  console.log("\n── Valid connection ──");
  const user1 = await connectWs(PORT, "user1_tok");
  await sleep(100);
  check("user1 connected", user1.ws.readyState === WebSocket.OPEN);
  check("received welcome event", user1.messages[0]?.event === "connected", user1.messages[0]);
  check("connection count is 1", getConnectionCount("user_1") === 1);

  // ── Test 4: emitToUser sends to correct user ─────────────────────────
  console.log("\n── Per-user routing ──");
  const user2 = await connectWs(PORT, "user2_tok");
  await sleep(100);

  // Clear welcome messages
  user1.messages.length = 0;
  user2.messages.length = 0;

  emitToUser("user_1", "payment_made", { amount_sats: 5000, purpose: "test" });
  await sleep(100);

  check("user1 received payment_made", user1.messages.length === 1 && user1.messages[0].event === "payment_made", user1.messages[0]);
  check("user2 did NOT receive it", user2.messages.length === 0, user2.messages);

  // ── Test 5: emitToUser returns count ──────────────────────────────────
  console.log("\n── Emit return count ──");
  const sent = emitToUser("user_2", "test_event", { hello: "world" });
  check("emitToUser returns 1", sent === 1, sent);

  const sentNone = emitToUser("nonexistent_user", "test", {});
  check("emit to nonexistent user returns 0", sentNone === 0, sentNone);

  // ── Test 6: Disconnect cleanup ────────────────────────────────────────
  console.log("\n── Disconnect cleanup ──");
  user1.ws.close();
  await sleep(100);
  check("after disconnect, connection count is 0", getConnectionCount("user_1") === 0);

  // ── Test 7: Event shape ───────────────────────────────────────────────
  console.log("\n── Event shape ──");
  user2.messages.length = 0;
  emitToUser("user_2", "approval_requested", { approval_id: "apr_1", amount_sats: 12000, reason: "test" });
  await sleep(100);
  const evt = user2.messages[0];
  check("has event field", evt?.event === "approval_requested", evt);
  check("has data field", evt?.data?.approval_id === "apr_1", evt);
  check("has timestamp field", typeof evt?.timestamp === "string", evt);

  // Cleanup
  user2.ws.close();
  httpServer.close();

  console.log(`\n${"═".repeat(50)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`  Task 4 validation: ${failed === 0 ? "✅ PASSED" : "❌ FAILED"}`);
  console.log("═".repeat(50));

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
