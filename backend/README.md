# Aegis Backend — UI/UX Integration Reference

This document covers everything the frontend needs to know about the backend MCP layer: WebSocket events, tool response shapes, failure states, data fields, and integration notes.

---

## Table of Contents

1. [WebSocket Events](#websocket-events)
2. [MCP Tools & Response Shapes](#mcp-tools--response-shapes)
3. [Failure States](#failure-states)
4. [Data Records & Fields](#data-records--fields)
5. [Audit Log](#audit-log)
6. [Integration Notes](#integration-notes)

---

## WebSocket Events

Connect to the WebSocket server with a credential ID as a query param (`?token=<credential_id>`). All events share the same envelope:

```json
{
  "event": "<event name>",
  "data": { ... },
  "timestamp": "<ISO8601>"
}
```

### `connected`
Fires on successful authentication.
```json
{
  "event": "connected",
  "data": { "credential_id": "user_1" },
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

### `payment_made`
Fires after any successful payment by Claude. Use this to update the balance display and push to the activity feed in real time.
```json
{
  "event": "payment_made",
  "data": {
    "amount_sats": 8200,
    "amount_usd": "7.87",
    "purpose": "coolproject.co domain registration",
    "balance_remaining_sats": 41800,
    "balance_remaining_usd": "40.13",
    "approval_type": "auto",
    "agent_id": "agent_1"
  },
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```
`approval_type` is `"auto"` (under threshold, no user interaction) or `"manual"` (user approved via biometric).

### `approval_requested`
Claude needs user sign-off on a payment over the auto-pay threshold. **Show the approval modal.**
```json
{
  "event": "approval_requested",
  "data": {
    "approval_id": "apr_3",
    "type": "payment",
    "amount_sats": 20000,
    "amount_usd": "19.20",
    "reason": "coolproject.co domain registration — $19.20",
    "expires_at": "2026-04-11T12:10:00.000Z"
  },
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```
Use `expires_at` for a countdown timer. Auto-dismiss the modal at expiry (server will deny after 10 minutes).

### `approval_resolved`
Fires when an approval reaches a terminal state — user approved or denied. **Dismiss the approval modal.**
```json
{
  "event": "approval_resolved",
  "data": {
    "approval_id": "apr_3",
    "approved": true
  },
  "timestamp": "2026-04-11T12:00:30.000Z"
}
```

### `topup_requested`
Claude's budget is exhausted and it's requesting more funds. **Show the top-up modal.** Same shape as `approval_requested` but `type` is `"topup"` — use a different modal/screen for this.
```json
{
  "event": "topup_requested",
  "data": {
    "approval_id": "apr_4",
    "amount_sats": 50000,
    "amount_usd": "48.00",
    "reason": "Need $48.00 more to complete the API subscription you requested",
    "expires_at": "2026-04-11T12:10:00.000Z"
  },
  "timestamp": "2026-04-11T12:01:00.000Z"
}
```

### `topup_approved`
Fires when a top-up is approved. **Update the balance display.**
```json
{
  "event": "topup_approved",
  "data": {
    "new_balance_sats": 100000,
    "new_balance_usd": "96.00"
  },
  "timestamp": "2026-04-11T12:01:30.000Z"
}
```

---

## MCP Tools & Response Shapes

These tools are called by Claude, not directly by the frontend. But the response shapes feed directly into WS events and the REST API, so the frontend needs to understand them to build the matching UI states.

### `pay_invoice`

**Success — payment settled:**
```json
{
  "success": true,
  "amount_sats": 8200,
  "amount_usd": "7.87",
  "fee_sats": 9,
  "balance_remaining_sats": 41800,
  "balance_remaining_usd": "40.13",
  "preimage": "a3f7...",
  "invoice_description": "coolproject.co domain"
}
```
`preimage` is the cryptographic proof of payment. If it's present, the payment is confirmed.

**Success — already paid (idempotency guard):**
```json
{
  "success": true,
  "already_paid": true,
  "amount_sats": 8200,
  "amount_usd": "7.87",
  "purpose": "coolproject.co domain registration",
  "preimage": null,
  "message": "This invoice has already been paid. No funds were moved."
}
```
Show an "already settled" badge. No duplicate charge occurred.

**Security warning (prompt injection detected in invoice):**
```json
{
  "success": true,
  "invoice_description": "[description hidden]",
  "security_warning": "The invoice description contains suspicious text that may be a prompt injection attempt. It has been hidden."
}
```
Show a security warning banner in the activity feed entry for this payment.

### `get_balance`
```json
{
  "balance_sats": 50000,
  "balance_usd": "48.00",
  "auto_pay_threshold_sats": 15000,
  "auto_pay_threshold_usd": "14.40"
}
```
`auto_pay_threshold_sats` is the per-user configurable limit. Payments under this are auto-approved by Claude; payments over it trigger an `approval_requested` event.

### `get_budget_status`
```json
{
  "spent_today_sats": 12000,
  "spent_today_usd": "11.52",
  "remaining_sats": 38000,
  "remaining_usd": "36.48",
  "total_budget_sats": 50000,
  "total_budget_usd": "48.00",
  "recent_payments": [
    {
      "amount_sats": 8200,
      "amount_usd": "7.87",
      "purpose": "domain registration",
      "approval_type": "auto",
      "timestamp": "2026-04-11T12:00:00.000Z"
    }
  ]
}
```
Use `spent_today_sats / total_budget_sats` to render the `AgentBudget` progress bar.

### `create_invoice`
```json
{
  "bolt11": "lnbc50000n1...",
  "payment_hash": "a3f7...",
  "expires_at": "2026-04-11T12:15:00.000Z"
}
```

### `list_payments`
```json
{
  "payments": [
    {
      "amount_sats": 8200,
      "amount_usd": "7.87",
      "purpose": "domain registration",
      "approval_type": "auto",
      "timestamp": "2026-04-11T12:00:00.000Z"
    }
  ]
}
```

### `request_approval` — approved
```json
{
  "approved": true,
  "approval_id": "apr_3",
  "next_action": "User approved the payment of $19.20 USD. Now call pay_invoice with approval_id=..."
}
```

### `request_approval` — denied or timed out
```json
{
  "approved": false,
  "approval_id": "apr_3",
  "reason": "denied_by_user",
  "instruction": "The user declined this payment. Do not retry..."
}
```
`reason` is either `"denied_by_user"` or `"timeout"`.

### `request_topup` — approved
```json
{
  "approved": true,
  "new_balance_sats": 100000,
  "new_balance_usd": "96.00",
  "next_action": "Budget increased to $96.00 USD. You can now retry the payment using pay_invoice."
}
```

### `request_topup` — denied
```json
{
  "approved": false,
  "reason": "denied_by_user",
  "instruction": "The user declined the budget top-up. Do not attempt the payment."
}
```

---

## Failure States

These are structured responses (not hard errors) that represent states requiring UI action. Each maps to a specific screen state or modal.

### Insufficient balance
```json
{
  "success": false,
  "reason": "insufficient_balance",
  "balance_sats": 12000,
  "balance_usd": "11.52",
  "invoice_amount_sats": 15000,
  "invoice_amount_usd": "14.40",
  "shortfall_sats": 3000,
  "shortfall_usd": "2.88"
}
```
**UI action:** Show a top-up prompt. `shortfall_usd` is the amount to pre-fill in the top-up field.

### Over auto-pay threshold
```json
{
  "success": false,
  "reason": "over_threshold",
  "invoice_amount_sats": 20000,
  "invoice_amount_usd": "19.20",
  "threshold_sats": 15000,
  "threshold_usd": "14.40"
}
```
**UI action:** Show an approval modal. The `approval_requested` WS event will follow immediately.

### Agent paused
```json
{
  "error": "agent_paused",
  "message": "Agent is paused by user.",
  "instruction": "Stop all payment attempts immediately. To resume, open the Aegis web app and tap 'Resume Agent'."
}
```
**UI action:** Show a "Agent Paused" banner with a "Resume" CTA.

### Rate limited
```json
{
  "error": "rate_limited",
  "message": "Rate limited — max 30 tool calls per minute.",
  "instruction": "Wait 60 seconds before trying again."
}
```
**UI action:** Show a brief cooldown indicator.

---

## Data Records & Fields

### Transaction
```ts
{
  id: string               // "tx_1"
  agent_id: string
  type: "payment"
  amount_sats: number
  purpose: string          // Claude's stated reason — show in activity feed
  bolt11: string           // Raw invoice — don't display
  payment_hash: string     // Hex — used for idempotency; show as tx ID
  status: "settled"
  approval_type: "auto" | "manual"  // Badge in activity feed
  approval_id: string | null        // Links to approval record
  created_at: string       // ISO8601
}
```

`approval_type` badge logic for the activity feed:
- `"auto"` → green "Auto" badge (under threshold, no user interaction needed)
- `"manual"` → blue "Approved" badge (user biometrically signed off)

### Approval
```ts
{
  id: string               // "apr_1"
  agent_id: string
  type: "payment" | "topup"   // Different modal for each
  amount_sats: number
  reason: string           // Shown to user on approval screen
  status: "pending" | "approved" | "denied"
  expires_at: string       // ISO8601 — use for countdown
}
```

### User
```ts
{
  credential_id: string
  auto_pay_threshold_sats: number   // Default: 15000
  created_at: string
}
```

`auto_pay_threshold_sats` is user-configurable from the Settings screen. Payments at or below this auto-approve; above requires biometric.

---

## Audit Log

`db.getAuditLog(agentId, limit)` returns a reverse-chronological log of all resolved tool calls. Feeds the agent activity feed.

```ts
{
  agent_id: string
  tool: "pay_invoice" | "request_approval" | "request_topup"
  params_summary: string   // Human-readable, e.g. "8200 sats — domain registration"
  outcome: string          // e.g. "settled, 41800 sats remaining" | "approved" | "denied" | "timeout"
  timestamp: string        // ISO8601
}
```

Tools logged: `pay_invoice` (on success), `request_approval` (on any resolution), `request_topup` (on any resolution).

---

## Integration Notes

### USD amounts
Every response includes both `_sats` and `_usd` fields for any amount. `_usd` is a pre-calculated string (e.g., `"19.20"`) — no frontend math needed. BTC price is cached at $96,000 for now (60s TTL); will be wired to a live feed before demo.

### Approval modal countdown
Both `approval_requested` and `topup_requested` include `expires_at`. The server auto-denies after 10 minutes. Use `expires_at - now` to show a countdown and auto-dismiss the modal at zero.

### Approval vs top-up modals
These are distinct UX flows even though both block on user action:
- `approval_requested` → user is approving **one specific payment** (single-use, tied to an `approval_id`)
- `topup_requested` → user is adding **more budget** for Claude to use going forward

### Activity feed badges
| `approval_type` | Badge | Meaning |
|---|---|---|
| `"auto"` | Auto | Payment was under threshold, Claude paid without asking |
| `"manual"` | Approved | User biometrically approved this specific payment |

### Agent lifecycle states
| `agent.status` | Frontend state |
|---|---|
| `"active"` | Normal — all tools available |
| `"paused"` | Show "Agent Paused" banner + Resume CTA. WS events for payments will not fire. |

### Idempotency
If Claude retries a payment with the same invoice, `pay_invoice` returns `already_paid: true` — no duplicate charge. Show an "already settled" state rather than treating this as an error.

### Security warnings
If `security_warning` appears in a `payment_made` response, the invoice description from the merchant was flagged as a potential prompt injection attempt and hidden. Show a warning indicator on that activity feed entry.
