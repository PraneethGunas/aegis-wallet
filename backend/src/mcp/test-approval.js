/**
 * Test approval + topup flow end-to-end:
 * MCP tool → DB polling → WebSocket event → simulate user response → tool resolves.
 *
 * Run: node src/mcp/test-approval.js
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import express from "express";
import http from "http";
import WebSocket from "ws";
import { init as initWs } from "../ws/notifications.js";
import * as sharedStore from "../mocks/shared-store.js";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, "server.js");

let passed = 0;
let failed = 0;

function parse(result) {
  return JSON.parse(result.content[0].text);
}

function check(name, condition, data) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    if (data !== undefined) console.log(`     Got:`, JSON.stringify(data));
    failed++;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("═══ Task 6: Approval + Topup Flow Tests ═══\n");

  // Clear shared approval store
  sharedStore.clearStore();

  // ── Start Express + WS server ───────────────────────────────────────────
  const PORT = 3001; // MCP server.js POSTs to this port
  const app = express();
  app.use(express.json());

  // Import emitToUser for the dev endpoint
  const { emitToUser } = await import("../ws/notifications.js");
  app.post("/dev/emit", (req, res) => {
    const { credential_id, event, data } = req.body;
    const sent = emitToUser(credential_id, event, data);
    res.json({ sent });
  });

  const httpServer = http.createServer(app);
  initWs(httpServer, (token) => {
    if (token === "ws_user_1") return { credential_id: "user_1" };
    return null;
  });

  await new Promise((r) => httpServer.listen(PORT, r));
  console.log(`Express + WS server on port ${PORT}`);

  // ── Connect WS client (simulating user's browser) ──────────────────────
  const wsMessages = [];
  const wsClient = new WebSocket(`ws://localhost:${PORT}/ws?token=ws_user_1`);
  await new Promise((resolve) => {
    wsClient.on("open", resolve);
    wsClient.on("message", (data) => wsMessages.push(JSON.parse(data.toString())));
  });
  await sleep(200); // let welcome message arrive
  wsMessages.length = 0; // clear welcome

  // ── Start MCP client ───────────────────────────────────────────────────
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath, "--token", "test_token_123"],
    env: { ...process.env, PORT: String(PORT) },
  });
  const mcpClient = new Client({ name: "approval-test", version: "0.0.1" });
  await mcpClient.connect(transport);
  console.log("MCP client connected\n");

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 1: request_approval → WS event → external approve → tool resolves
  // ══════════════════════════════════════════════════════════════════════════
  console.log("── Test: request_approval flow ──");

  // Call request_approval in background — it will block (poll DB)
  const approvalPromise = mcpClient.callTool({
    name: "request_approval",
    arguments: { amount_sats: 12000, reason: "coolproject.co domain" },
  });

  // Wait for WS event to arrive
  await sleep(2000);
  const approvalEvent = wsMessages.find((m) => m.event === "approval_requested");
  check("WS received approval_requested", !!approvalEvent, wsMessages);
  check("event has approval_id", !!approvalEvent?.data?.approval_id, approvalEvent?.data);
  check("event has amount_sats=12000", approvalEvent?.data?.amount_sats === 12000, approvalEvent?.data);
  check("event has reason", approvalEvent?.data?.reason === "coolproject.co domain", approvalEvent?.data);

  // Simulate user approving (update DB directly — in real life, POST /agent/approve does this)
  if (approvalEvent?.data?.approval_id) {
    sharedStore.updateApprovalStatus(approvalEvent.data.approval_id, "approved");
  }

  // Wait for tool to resolve
  const approvalResult = parse(await approvalPromise);
  check("tool returns approved=true", approvalResult.approved === true, approvalResult);
  check("tool returns approval_id", !!approvalResult.approval_id, approvalResult);

  // Check WS got approval_resolved
  await sleep(500);
  const resolvedEvent = wsMessages.find((m) => m.event === "approval_resolved");
  check("WS received approval_resolved", !!resolvedEvent, wsMessages.map(m => m.event));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 2: request_approval → denied
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── Test: request_approval denied ──");
  wsMessages.length = 0;

  const denyPromise = mcpClient.callTool({
    name: "request_approval",
    arguments: { amount_sats: 50000, reason: "expensive thing" },
  });

  await sleep(2000);
  const denyEvent = wsMessages.find((m) => m.event === "approval_requested");
  check("WS received approval_requested for deny test", !!denyEvent, wsMessages);

  if (denyEvent?.data?.approval_id) {
    sharedStore.updateApprovalStatus(denyEvent.data.approval_id, "denied");
  }

  const denyResult = parse(await denyPromise);
  check("tool returns approved=false", denyResult.approved === false, denyResult);
  check("reason is denied_by_user", denyResult.reason === "denied_by_user", denyResult);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 3: request_topup → approve → balance increases
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── Test: request_topup flow ──");
  wsMessages.length = 0;

  // Get balance before topup
  const balBefore = parse(await mcpClient.callTool({ name: "get_balance", arguments: {} }));
  const balanceBefore = balBefore.balance_sats;

  const topupPromise = mcpClient.callTool({
    name: "request_topup",
    arguments: { amount_sats: 20000, reason: "Need more for API" },
  });

  await sleep(2000);
  const topupEvent = wsMessages.find((m) => m.event === "topup_requested");
  check("WS received topup_requested", !!topupEvent, wsMessages);
  check("topup amount_sats=20000", topupEvent?.data?.amount_sats === 20000, topupEvent?.data);

  if (topupEvent?.data?.approval_id) {
    sharedStore.updateApprovalStatus(topupEvent.data.approval_id, "approved");
  }

  const topupResult = parse(await topupPromise);
  check("topup approved=true", topupResult.approved === true, topupResult);
  check("new_balance > old balance", topupResult.new_balance_sats > balanceBefore, topupResult);

  // Check topup_approved WS event
  await sleep(500);
  const topupApproved = wsMessages.find((m) => m.event === "topup_approved");
  check("WS received topup_approved", !!topupApproved, wsMessages.map(m => m.event));

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 4: pay_invoice emits payment_made WS event
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n── Test: pay_invoice emits WS event ──");
  wsMessages.length = 0;

  await mcpClient.callTool({
    name: "pay_invoice",
    arguments: { bolt11: "lnbc5000n1mocktest", purpose: "Test WS payment" },
  });
  await sleep(1000);

  const paymentEvent = wsMessages.find((m) => m.event === "payment_made");
  check("WS received payment_made", !!paymentEvent, wsMessages.map(m => m.event));
  check("payment has purpose", paymentEvent?.data?.purpose === "Test WS payment", paymentEvent?.data);

  // ── Summary ─────────────────────────────────────────────────────────────
  wsClient.close();
  await mcpClient.close();
  httpServer.close();

  console.log(`\n${"═".repeat(50)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`  Task 6 validation: ${failed === 0 ? "✅ PASSED" : "❌ FAILED"}`);
  console.log("═".repeat(50));

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
