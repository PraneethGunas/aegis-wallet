/**
 * Test client — spawns the MCP server and validates all 7 tools + ping.
 * Run: node src/mcp/test-client.js
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import * as sharedStore from "../mocks/shared-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, "server.js");
const APPROVALS_FILE = "/tmp/aegis-approvals.json";

function parse(result) {
  return JSON.parse(result.content[0].text);
}

let passed = 0;
let failed = 0;

function check(name, condition, data) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    console.log(`     Got:`, JSON.stringify(data));
    failed++;
  }
}

/** Poll the shared approval store and approve any pending records. */
function startAutoApprover() {
  return setInterval(() => {
    try {
      const store = JSON.parse(fs.readFileSync(APPROVALS_FILE, "utf-8"));
      for (const [id, rec] of Object.entries(store)) {
        if (rec.status === "pending") sharedStore.updateApprovalStatus(id, "approved");
      }
    } catch {}
  }, 500);
}

async function main() {
  console.log("Starting MCP server with --token test_token_123 ...\n");
  sharedStore.clearStore();

  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath, "--token", "test_token_123"],
  });

  const client = new Client({ name: "aegis-test-client", version: "0.0.1" });
  await client.connect(transport);

  // ── List tools ──────────────────────────────────────────────────────────
  console.log("── Tools available ──");
  const { tools } = await client.listTools();
  const toolNames = tools.map((t) => t.name).sort();
  console.log(`  Found ${tools.length} tools: ${toolNames.join(", ")}\n`);

  const expected = ["create_invoice", "get_balance", "get_budget_status", "list_payments", "pay_invoice", "ping", "request_approval", "request_topup"];
  check("All 8 tools registered (7 + ping)", JSON.stringify(toolNames) === JSON.stringify(expected), toolNames);

  // ── ping ────────────────────────────────────────────────────────────────
  console.log("\n── ping ──");
  const ping = parse(await client.callTool({ name: "ping", arguments: {} }));
  check("status is ok", ping.status === "ok", ping);
  check("agent_id present", !!ping.agent_id, ping);

  // ── get_balance ─────────────────────────────────────────────────────────
  console.log("\n── get_balance ──");
  const balance = parse(await client.callTool({ name: "get_balance", arguments: {} }));
  check("balance_sats is a number", typeof balance.balance_sats === "number", balance);
  check("balance_usd is a string", typeof balance.balance_usd === "string", balance);
  check("auto_pay_threshold_sats present", typeof balance.auto_pay_threshold_sats === "number", balance);

  // ── get_budget_status ───────────────────────────────────────────────────
  console.log("\n── get_budget_status ──");
  const budget = parse(await client.callTool({ name: "get_budget_status", arguments: {} }));
  check("spent_today_sats is a number", typeof budget.spent_today_sats === "number", budget);
  check("remaining_sats is a number", typeof budget.remaining_sats === "number", budget);
  check("total_budget_sats is a number", typeof budget.total_budget_sats === "number", budget);
  check("recent_payments is an array", Array.isArray(budget.recent_payments), budget);

  // ── create_invoice ──────────────────────────────────────────────────────
  console.log("\n── create_invoice ──");
  const invoice = parse(await client.callTool({ name: "create_invoice", arguments: { amount_sats: 5000, memo: "Test invoice" } }));
  check("bolt11 starts with lnbc", invoice.bolt11?.startsWith("lnbc"), invoice);
  check("payment_hash present", !!invoice.payment_hash, invoice);
  check("expires_at present", !!invoice.expires_at, invoice);

  // ── pay_invoice ─────────────────────────────────────────────────────────
  console.log("\n── pay_invoice ──");
  const payment = parse(await client.callTool({ name: "pay_invoice", arguments: { bolt11: "lnbc10000n1mock", purpose: "Test payment" } }));
  check("success is true", payment.success === true, payment);
  check("amount_sats is 10000", payment.amount_sats === 10000, payment);
  check("preimage is a hex string", /^[0-9a-f]+$/.test(payment.preimage), payment);
  check("balance_remaining_sats is a number", typeof payment.balance_remaining_sats === "number", payment);

  // ── request_approval (auto-approve via shared file store) ──────────────
  console.log("\n── request_approval ──");
  const interval1 = startAutoApprover();
  const approval = parse(await client.callTool({ name: "request_approval", arguments: { amount_sats: 12000, reason: "coolproject.co domain" } }));
  clearInterval(interval1);
  check("approved is true", approval.approved === true, approval);
  check("approval_id present", !!approval.approval_id, approval);

  // ── request_topup (auto-approve via shared file store) ─────────────────
  console.log("\n── request_topup ──");
  const interval2 = startAutoApprover();
  const topup = parse(await client.callTool({ name: "request_topup", arguments: { amount_sats: 20000, reason: "Need more budget for API" } }));
  clearInterval(interval2);
  check("approved is true", topup.approved === true, topup);
  check("new_balance_sats is a number", typeof topup.new_balance_sats === "number", topup);

  // ── list_payments ───────────────────────────────────────────────────────
  console.log("\n── list_payments ──");
  const payments = parse(await client.callTool({ name: "list_payments", arguments: { limit: 5 } }));
  check("payments is an array", Array.isArray(payments.payments), payments);
  if (payments.payments.length > 0) {
    const p = payments.payments[0];
    check("first payment has amount_sats", typeof p.amount_sats === "number", p);
    check("first payment has purpose", typeof p.purpose === "string", p);
    check("first payment has approval_type", typeof p.approval_type === "string", p);
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(50)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`  Task 2 validation: ${failed === 0 ? "✅ PASSED" : "❌ FAILED"}`);
  console.log("═".repeat(50));

  await client.close();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
