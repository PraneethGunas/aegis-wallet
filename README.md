# Aegis — The Agentic Bitcoin Wallet

A seedless Bitcoin wallet where Claude is your AI financial agent. Spending is enforced cryptographically by Lightning macaroons — not application code. No seed phrase. No 24 words. Your keys live in your device's secure enclave, derived from a passkey.

Built at MIT Bitcoin Hackathon 2026.

---

## How It Works

```
┌─────────────────────────────────────────────────┐
│  L1: FUNDING WALLET (Self-Custody)              │
│  Standard Taproot address on mainnet.            │
│  Passkey derives your key AND signs txs.         │
│  Server has ZERO access to funding wallet.       │
├─────────────────────────────────────────────────┤
│  ↕ You move funds between layers (Face ID)      │
├─────────────────────────────────────────────────┤
│  L2: SPENDING (Custodial Lightning)             │
│  LND + litd node. Claude operates here via MCP. │
│  Scoped macaroon = budget ceiling.               │
│  One slider. One number. LND enforces it.        │
└─────────────────────────────────────────────────┘
```

**Layer 1 (Funding)** — A standard Taproot address (P2TR, BIP 86) on Bitcoin mainnet. Your passkey derives the private key AND signs all on-chain transactions in the browser. The key never leaves your device. If our server disappears, you still have your key.

**Layer 2 (Spending)** — An LND Lightning node wrapped by litd. Claude gets wallet tools via an MCP server with a scoped macaroon tied to a litd account. The macaroon has a hard spending ceiling enforced by LND's RPC middleware — not our code. Claude can pay invoices, fetch L402 APIs, and check balances. When the budget runs out, the invoice is forwarded to your dashboard where you can pay it directly.

**Passkey** — WebAuthn PRF extension derives keys from your device's secure enclave. No seed phrase is ever generated or stored. On L1, the passkey derives the key and signs. On L2, the passkey authenticates. Recovery = passkey syncs to your new device, wallet regenerates deterministically.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   USER'S BROWSER                      │
│                                                        │
│  Secure Enclave ──→ Passkey (PRF) ──→ Key Derivation │
│  funding_key:  m/86h/0h/0h/0/0  (Taproot, L1 signer)│
│  auth_key:     m/84h/0h/0h/0/0  (L2 auth only)      │
│  On-chain transactions signed HERE. Keys NEVER sent.  │
└──────────────────────┬───────────────────────────────┘
                       │ HTTPS / WSS
┌──────────────────────▼───────────────────────────────┐
│                   BACKEND SERVER                      │
│  Node.js + Express + WebSocket                        │
│  ├── LND + litd ← Lightning payments                 │
│  ├── litd accounts ← budget enforcement              │
│  └── /agent/pay-direct ← user pays when agent can't  │
└──────────────────────────────────────────────────────┘

┌──────────────────────┐         ┌──────────────────────┐
│  Claude               │  MCP   │  aegis-wallet MCP     │
│  (Desktop / Code /    │◄──────►│  ├─ pay_invoice       │
│   Cowork)             │ stdio  │  ├─ l402_fetch        │
│                        │        │  ├─ get_balance       │
│  Claude IS the agent.  │        │  ├─ decode_invoice    │
│  No custom bot code.   │        │  ├─ create_invoice    │
│                        │        │  ├─ list_payments     │
│                        │        │  ├─ get_spending_sum. │
│                        │        │  └─ macaroon (hidden) │
└──────────────────────┘         └──────────────────────┘
```

### Budget Enforcement

```
User sets spending limit in UI ($2.50 → 2,500 sats)
  → Backend creates litd account with that ceiling
  → Bakes scoped macaroon: routerrpc + 5 URI permissions + account caveat
  → MCP server receives macaroon via --macaroon CLI arg

Claude calls pay_invoice or l402_fetch via MCP
  → MCP attaches scoped macaroon to LND gRPC call
  → LND RPC middleware checks: account balance >= amount + fees?
    YES → payment routed, balance deducted
    NO  → rejected at LND layer — MCP sends WebSocket to dashboard
          → User sees "Budget exceeded" banner → taps "Pay directly"
          → Backend pays with admin macaroon (user's direct payment)

Claude cannot see on-chain funds, node channels, or real balance.
Claude cannot bake new macaroons or escalate its own permissions.
```

---

## MCP Server (`aegis-wallet`)

The MCP server is a standalone npm package. Claude Desktop runs it as a subprocess.

```bash
npx aegis-wallet --macaroon <base64> [--api-url http://localhost:3001] [--user-id <credential>]
```

### Tools (7)

| Tool | Description |
|------|-------------|
| `pay_invoice(bolt11, purpose, max_cost_sats?)` | Pay a Lightning invoice. Optional per-payment cost cap. |
| `l402_fetch(url, method?, headers?, body?, max_cost_sats?)` | Fetch URL with automatic L402 payment. Handles 402 → pay → retry in one call. Caches tokens per domain. |
| `get_balance()` | Check remaining spending balance (sats + USD). |
| `decode_invoice(bolt11)` | Inspect a BOLT11 invoice before paying. |
| `create_invoice(amount_sats, memo)` | Generate a Lightning invoice to receive payment. |
| `list_payments(limit)` | Recent payment history with amounts and fees. |
| `get_spending_summary()` | Total spent, payment count, remaining balance, cached L402 domains. |

### Key Features

- **`l402_fetch`** — One-call L402 flow inspired by [lnget](https://github.com/lightninglabs/lightning-agent-tools). Hit a URL, handle the 402 challenge, pay the invoice, cache the token, retry with auth header. No manual steps.
- **`max_cost_sats`** — Per-payment safety cap (like `lnget --max-cost`). Refuses to pay if invoice exceeds it.
- **Token cache** — L402 tokens cached per domain in memory. Avoids re-paying the same service.
- **Budget escalation** — When LND rejects a payment, the MCP notifies the user's dashboard via WebSocket. User can pay directly with one tap.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js + Tailwind CSS |
| Backend | Node.js + Express + WebSocket |
| AI Agent | Claude (user's subscription) — no custom agent runtime |
| MCP Server | Node.js (`@modelcontextprotocol/sdk`) — standalone npm package |
| Lightning | LND + litd (Docker) |
| Passkey | `@simplewebauthn/browser` + PRF extension |
| Tx Signing | `@scure/bip32` + `@scure/bip39` + `tiny-secp256k1` (in browser) |
| Network | Bitcoin mainnet |

---

## Getting Started

### Prerequisites

- Node.js 22+ (`nvm install 22`)
- Docker + Docker Compose

### 1. Start LND + litd

```bash
docker compose up -d
```

### 2. Fund the wallet and open a channel

```bash
docker exec litd lncli newaddress p2tr
# Send mainnet sats to this address, then:
docker exec litd lncli openchannel --node_key <peer_pubkey> --local_amt 20000
```

### 3. Backend

```bash
cd backend && npm install && npm run dev    # http://localhost:3001
```

### 4. Frontend

```bash
cd web && npm install && npm run dev        # http://localhost:3000
```

### 5. Create wallet + pair Claude

1. Open http://localhost:3000 → create wallet with passkey
2. Set spending limit with slider → "Generate credential"
3. Copy the setup message → paste into Claude Desktop

---

## Project Structure

```
aegis/
├── mcp/                    # Standalone MCP server (npm: aegis-wallet)
│   ├── index.js            # Entry point, CLI arg parsing
│   ├── tools.js            # 7 wallet tools + L402 token cache
│   ├── lnd.js              # ln-service gRPC client (SendPaymentSync)
│   └── auth.js             # Rate limiting (30 calls/min)
├── backend/
│   ├── src/
│   │   ├── server.js       # Express + WebSocket server
│   │   ├── routes/         # wallet, agent, ln endpoints
│   │   ├── services/       # lnd.js, litd.js, mempool.js
│   │   ├── ws/             # Real-time notifications
│   │   └── db/             # SQLite schema + access
├── web/
│   ├── src/
│   │   ├── app/            # Next.js pages (landing, dashboard)
│   │   ├── lib/            # passkey.js, bitcoin.js, api.js, ws.js, store.js
│   │   └── components/     # AgentSetup, ApprovalBanner, Balance, TxList
├── CLAUDE.md               # Claude Code instructions
└── PROJECT_SPEC.md         # Full technical specification
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/wallet/create` | POST | Register passkey credential (wallet = identity) |
| `/wallet/balance` | GET | Combined L1 (mempool.space) + L2 (LND) balance |
| `/wallet/history` | GET | Unified tx history across both layers |
| `/agent/create` | POST | Create litd account + bake scoped macaroon |
| `/agent/budget` | PUT | Update spending limit (same macaroon, new ceiling) |
| `/agent/pay-direct` | POST | User pays a bolt11 directly (admin macaroon) |
| `/agent/pause` | POST | Freeze agent — macaroon stops working instantly |
| `/agent/revoke` | POST | Delete litd account — macaroon permanently invalid |
| `/ln/fund` | POST | Broadcast signed tx to fund Lightning |
| `/ln/open-channel` | POST | Open channel to default peer |

---

## Macaroon Permissions

The agent's scoped macaroon grants exactly these gRPC methods:

| Granted | Purpose |
|---------|---------|
| `routerrpc.Router/SendPaymentV2` | Pay invoices (streaming) |
| `routerrpc.Router/TrackPaymentV2` | Track payment status |
| `lnrpc.Lightning/SendPaymentSync` | Pay invoices (legacy fallback) |
| `lnrpc.Lightning/DecodePayReq` | Decode BOLT11 invoices |
| `lnrpc.Lightning/ChannelBalance` | Check spending balance |
| `lnrpc.Lightning/ListPayments` | View payment history |
| `lnrpc.Lightning/GetInfo` | Node health check |
| `lnrpc.Lightning/AddInvoice` | Create invoices to receive |

Plus a litd account caveat (`lnd-custom account <id>`) that enforces the budget ceiling.

**Denied:** all on-chain operations, channel management, peer discovery, macaroon baking.

---

## Security

- L1 signing keys derived client-side via WebAuthn PRF — never sent to the server
- L2 macaroon is a scoped bearer token, not a signing key — LND holds Lightning keys
- Budget enforcement is cryptographic (LND RPC middleware), not application logic
- Agent cannot access L1 funds, see node topology, or escalate its own permissions
- Revoking an agent deletes the litd account — macaroon dies instantly

See [SECURITY.md](SECURITY.md) for the full security model.

---

## License

[MIT](LICENSE)

---

## References

- [Lightning Agent Tools](https://github.com/lightninglabs/lightning-agent-tools) — lnget, macaroon-bakery, commerce skills
- [L402 for Agents](https://lightning.engineering/posts/2026-03-11-L402-for-agents/) — Agent payment protocol
- [litd Accounts](https://docs.lightning.engineering/lightning-network-tools/lightning-terminal/accounts) — Virtual Lightning accounts
- [LND Macaroons](https://docs.lightning.engineering/lightning-network-tools/lnd/macaroons) — Scoped authentication tokens
- [MCP Protocol](https://modelcontextprotocol.io/) — Model Context Protocol
- [WebAuthn PRF](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/) — Passkey-based key derivation
- [402index](https://402index.com) — Directory of L402-enabled APIs
