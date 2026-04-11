# Aegis — Agentic Bitcoin Wallet

## What This Is

A seedless Bitcoin wallet where Claude is the AI financial agent. Two-layer custody: L1 self-custodial standard Taproot address + L2 custodial Lightning with macaroon-enforced budgets. Claude operates on L2 via MCP server — no custom agent runtime. User authenticates with passkeys (WebAuthn PRF).

Full spec: `PROJECT_SPEC.md`

---

## Architecture (TL;DR)

```
L1 (Funding, SELF-CUSTODY):  Standard Taproot address (P2TR, BIP 86) on testnet
                              Passkey derives the key AND signs on-chain txs
                              Server has ZERO access to funding wallet
                              No agent, no co-signer, no covenants

L2 (Spending, CUSTODIAL):    LND + litd on our server
                              Claude gets wallet tools via MCP server
                              Scoped macaroon stays server-side (Claude never sees it)
                              User explicitly funds L2 from L1
                              Self-custodial option: user runs own LND node

Agent (Claude via MCP):      MCP server exposes: pay_invoice, get_balance,
                              get_budget_status, request_topup, create_invoice,
                              list_payments
                              Claude IS the agent — no custom bot code
                              Budget enforced by LND RPC middleware (macaroon)

Control Plane:               WebAuthn passkey (PRF extension)
                              L1: derives signing key (passkey IS the key)
                              L2: authentication only (passkey approves actions)
                              No seed phrase ever shown to user
```

---

## Tech Stack

- **Frontend:** Next.js (React) + Tailwind CSS — web app is primary target
- **Backend:** Node.js + Express — REST API + WebSocket
- **MCP Server:** Node.js (MCP SDK) — exposes wallet tools to Claude, holds scoped macaroon
- **AI Agent:** Claude (user's existing subscription) — no custom agent runtime
- **Lightning:** LND v0.18+ wrapped by litd — accounts, macaroon bakery, RPC middleware
- **Passkey:** @simplewebauthn/browser + PRF extension (client-side key derivation)
- **Tx Signing:** bitcoinjs-lib + bip39 + tiny-secp256k1 (in browser, never on server)
- **Database:** SQLite or Postgres — user accounts, agent configs, tx history
- **Mobile (stretch):** React Native + Expo

---

## File Structure

```
aegis/
├── CLAUDE.md
├── PROJECT_SPEC.md
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── server.js              # Express API server + WebSocket
│   │   ├── routes/
│   │   │   ├── wallet.js          # Create wallet, balance, send/receive, history
│   │   │   └── agent.js           # Agent: create, pair, topup, pause, status
│   │   ├── services/
│   │   │   ├── lnd.js             # LND gRPC client
│   │   │   ├── litd.js            # litd account management
│   │   │   ├── macaroon.js        # Macaroon baking + attenuation
│   │   │   └── passkey.js         # WebAuthn assertion verification (passkey = identity)
│   │   ├── mcp/
│   │   │   ├── server.js          # MCP server (stdio or SSE transport)
│   │   │   ├── tools.js           # Tool definitions: pay_invoice, get_balance, etc.
│   │   │   ├── auth.js            # Agent auth token validation + rate limiting
│   │   │   └── pairing.js         # QR code / config generation for Claude pairing
│   │   ├── ws/
│   │   │   └── notifications.js   # WebSocket server for live updates
│   │   └── db/
│   │       ├── schema.sql         # User accounts, agent configs, tx history
│   │       └── index.js           # Database access layer
│   └── scripts/
│       ├── setup-lnd.sh           # LND + litd setup script
│       └── fund-wallet.sh         # Get testnet coins from faucet
├── web/                            # Next.js (primary frontend)
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.jsx
│   │   │   ├── page.jsx           # Landing / onboarding
│   │   │   ├── dashboard/page.jsx # Main wallet dashboard
│   │   │   ├── send/page.jsx
│   │   │   ├── receive/page.jsx
│   │   │   ├── agent/page.jsx     # Agent: pair Claude, budget, activity, pause
│   │   │   └── settings/page.jsx
│   │   ├── lib/
│   │   │   ├── passkey.js         # WebAuthn PRF key derivation (CLIENT-SIDE)
│   │   │   ├── bitcoin.js         # bitcoinjs-lib: key derivation, tx signing (CLIENT-SIDE)
│   │   │   ├── api.js             # Backend REST API client
│   │   │   └── ws.js              # WebSocket client for live updates
│   │   └── components/
│   │       ├── Balance.jsx        # Unified L1+L2 balance (USD primary)
│   │       ├── TxList.jsx         # Transaction history (agent-tagged)
│   │       ├── AgentBudget.jsx    # Agent budget progress bar
│   │       ├── ApprovalModal.jsx  # Biometric approval for budget top-ups
│   │       └── PairingQR.jsx      # QR code for Claude pairing
│   └── public/
└── docs/
    ├── PITCH_DECK.md
    └── DEMO_SCRIPT.md
```

---

## Critical Security Rules

- **L1 funding key is derived AND used for signing client-side via WebAuthn PRF — NEVER sent to the server.** The passkey is both the key derivation source and the signing mechanism. All on-chain transactions are signed in the browser.
- **On L2, the passkey is for authentication only.** It proves the user's identity to our backend (for creating agents, approving top-ups, withdrawing). LND holds the Lightning signing keys. The user does not sign Lightning transactions.
- **Never log, store, or transmit mnemonics, xprv values, or raw PRF entropy.** These exist only in browser memory during signing, then are discarded.
- **Agent operates on L2 only.** It holds a scoped macaroon via MCP — an authorization token, not a signing key. It cannot access L1 funds, see node topology, or bake new macaroons.
- **Never commit `.env` files, macaroon files, or any secrets to git.**

---

## Environment

- **Node.js:** v22.17.0 (via nvm)
- **npm:** 11.6.0
- **Network:** testnet (Bitcoin testnet for hackathon)
- **nunchuk-cli:** v0.1.0 (installed globally) — fallback L1 custody model
- **Nunchuk auth:** praneethgunasekaran@gmail.com

### Environment Variables (backend/.env)

```bash
LND_HOST=localhost:10009
LND_CERT_PATH=~/.lnd/tls.cert
LND_MACAROON_PATH=~/.lnd/data/chain/bitcoin/testnet/admin.macaroon
LITD_HOST=localhost:8443
PORT=3001
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## Key Technical Details

### Passkey Key Derivation (PRF)

```
PRF(passkey_credential, salt="aegis-wallet-v1") → 32 bytes
→ BIP39 mnemonic (never shown) → BIP32 master key
→ funding_key:  m/86h/1h/0h/0/0  (Taproot, testnet) — SIGNS L1 txs
→ auth_key:     m/84h/1h/0h/0/0  (Native SegWit, for L2 auth only)
```

**Passkey role per layer:**
- **L1 (Funding):** Passkey derives the private key AND signs on-chain transactions.
  The passkey IS the key. No other signer exists.
- **L2 (Spending):** Passkey authenticates the user to our backend (WebAuthn ceremony).
  LND holds the Lightning signing keys. User does not sign LN txs.

### L1 Funding Wallet (Standard Taproot)

```
Address type: P2TR (Taproot, BIP 86)
Key:          funding_key = master / 86h / 1h / 0h / 0 / 0
Network:      testnet (hackathon), mainnet (production)

Operations:
  - Receive: backend returns the Taproot address
  - Fund L2: user signs tx in browser → sends to LND's on-chain address
  - Send to address: user signs tx in browser → standard payment
  - Balance: backend queries testnet node for UTXO set

No agent. No server-side key. No covenants.
Passkey-derived key signs all L1 transactions in the browser.
```

### L2 Lightning (Macaroon Budget Enforcement)

```
litd account system creates a virtual balance ledger inside LND.
Each agent gets an account with a budget ceiling + scoped macaroon.

When Claude calls pay_invoice via MCP:
  1. MCP server calls LND SendPaymentV2 with agent's scoped macaroon
  2. LND RPC middleware intercepts BEFORE routing
  3. Checks: account.balance >= invoice_amount + estimated_fees?
     YES → routes payment, deducts from virtual balance
     NO  → returns error "insufficient balance" — never even attempts to route
  4. MCP server returns result to Claude

Enforcement is at the LND RPC layer — not in our code.
```

```bash
# Create agent account with budget
litcli accounts create 50000 --save_to /tmp/agent.macaroon

# Agent macaroon permissions:
# ✓ offchain:write, offchain:read, invoices:write, invoices:read
# ✗ onchain:*, peers:*, macaroon:*
```

### MCP Server + Claude as Agent

```
MCP Server (Node.js, @modelcontextprotocol/sdk):
  Tools exposed to Claude:
  - pay_invoice(bolt11, purpose)       → pay LN invoice within budget
  - create_invoice(amount_sats, memo)  → generate invoice to receive
  - get_balance()                      → read agent's budget balance
  - get_budget_status()                → remaining budget + spend history
  - request_topup(amount_sats, reason) → ask user for more budget (WS → biometric)
  - list_payments(limit)               → agent's own payment history

  NOT exposed to Claude:
  - No on-chain tools (L1 funding wallet invisible to Claude)
  - No macaroon access (held server-side only)
  - No node info (topology, channels, real balance)
```

### Agent Pairing Flow

```
1. User creates agent account in web app (litd account + scoped macaroon)
2. Web app shows QR code: MCP server URI + auth token
3. User scans QR / pastes config into Claude Code or Cowork
4. Claude now has wallet tools — macaroon stays server-side
5. Revoke: tap "Pause Agent" → macaroon frozen instantly
```

### API Endpoints

```
POST /wallet/create     — store passkey credential ID + public key (wallet creation IS identity)
GET  /wallet/balance    — combined L1+L2 balance
GET  /wallet/history    — unified tx history
POST /wallet/send       — send on-chain tx (user signs in browser)
POST /wallet/receive    — generate LN invoice or funding address
POST /agent/create      — create litd account + macaroon
POST /agent/pair        — generate MCP pairing config + QR
POST /agent/topup       — increase agent budget (WebAuthn assertion)
POST /agent/pause       — freeze agent macaroon
GET  /agent/status      — budget + activity
POST /ln/fund           — construct unsigned tx to fund LN (client signs)
POST /ln/withdraw       — withdraw LN balance → on-chain address

Auth: Every request includes a WebAuthn assertion or a short-lived token
from a recent assertion. The passkey credential ID IS the user identity.
No separate register/login flow.
```

---

## Nunchuk CLI (Fallback for L1)

If the standard Taproot approach needs policy enforcement without covenants, use Nunchuk's platform key for L1 policy enforcement on testnet:

```bash
nunchuk sandbox create --name "Aegis Vault" --m 2 --n 3
nunchuk sandbox add-key <sandbox-id> --slot 0 --fingerprint <user_xfp>
nunchuk sandbox add-key <sandbox-id> --slot 1 --fingerprint <agent_xfp>
nunchuk sandbox platform-key enable <sandbox-id>
nunchuk sandbox platform-key set-policy <sandbox-id> \
  --auto-broadcast --limit-amount 10 --limit-currency USD --limit-interval DAILY
nunchuk sandbox finalize <sandbox-id>
```

Full Nunchuk CLI reference: `nunchuk --help`.

### Nunchuk Agent Skills (Global, ~/.claude/skills/)

| Skill | Trigger |
|---|---|
| `nunchuk-setup` | Login, network switch, config |
| `nunchuk-wallet-creation` | "create a wallet" |
| `nunchuk-invitations` | "invite someone" |
| `nunchuk-platform-key` | "set spending limit" |
| `nunchuk-wallet-management` | "list wallets", "get address" |
| `nunchuk-wallet-transactions` | "send bitcoin", "sign transaction" |

---

## POC Scope (Must Have for Demo Day)

1. Passkey wallet creation (WebAuthn PRF, no seed phrase)
2. Funding address (L1) — Taproot from passkey-derived key, receive testnet BTC, display balance
3. Fund Lightning from funding wallet (biometric approval, passkey signs in browser)
4. MCP server with wallet tools (pay_invoice, get_balance, get_budget_status, request_topup, create_invoice, list_payments)
5. Agent pairing flow (QR/config → Claude connected via MCP, macaroon stays server-side)
6. Claude makes autonomous payment within budget
7. Budget enforcement (Claude overspends → denied by LND middleware → escalates)
8. User approval for budget top-up (websocket + biometric)
9. Unified balance display (L1 funding + L2 spending, USD primary)

### Nice to Have

- Agent delegation (Claude attenuates macaroon, creates sub-agent accounts)
- Mobile app (React Native + Expo)
- L402 API payments (Claude auto-pays paywalls)
- Airgapped QR pairing (credentials via camera only)
- Self-custodial L2 (user runs own LND node)

---

## Infrastructure Setup

```bash
# 1. Start LND on testnet
lnd --bitcoin.testnet --bitcoin.node=neutrino --debuglevel=info

# 2. Create LND wallet
lncli create

# 3. Start litd (wraps LND for account system)
litd --uipassword=aegis123 --lnd-mode=integrated --network=testnet

# 4. Get testnet coins
lncli newaddress p2tr
# Send testnet coins to this address from faucet

# 5. Open channel (after funding)
lncli openchannel --node_key <peer_pubkey> --local_amt 1000000

# 6. Backend
cd aegis/backend && npm install && npm run dev

# 7. Frontend
cd aegis/web && npm install && npm run dev
```

---

## Installed Agent Skills (~/.claude/skills/)

All skills are installed globally at `~/.claude/skills/` and available to Claude Code CLI. Claude Code auto-discovers skills from this directory — invoke with `/skill-name` or let Claude auto-invoke based on context.

### Lightning Labs — lightning-agent-tools (7 skills + docs)

Source: [github.com/lightninglabs/lightning-agent-tools](https://github.com/lightninglabs/lightning-agent-tools)

| Skill | Purpose | When to Use |
|---|---|---|
| `lnd` | Install and run litd (LND + loop + pool + tapd) via Docker | Setting up the Lightning node |
| `lightning-security-module` | Remote signer — keeps private keys on separate container | Production key isolation |
| `macaroon-bakery` | Bake scoped macaroons (pay-only, invoice-only, read-only, custom) | Creating agent credentials |
| `lnget` | HTTP client with automatic L402 payment handling | Agent paying for API access |
| `aperture` | L402 reverse proxy for gating paid API endpoints | Selling data/services via Lightning |
| `lightning-mcp-server` | MCP server with 18 read-only LND query tools via LNC | Connecting Claude to LND node |
| `commerce` | Meta-skill orchestrating full buyer/seller L402 workflows | End-to-end agent commerce setup |

**Docs:** `~/.claude/skills/lightning-docs/` — architecture, commerce flows, L402 guide, MCP server setup, security model, two-agent setup.

**Most relevant for Aegis:**
- `macaroon-bakery` — baking scoped agent macaroons (core to our L2 agent budget system)
- `lnd` — litd setup scripts for our backend node
- `lightning-mcp-server` — optional: lets Claude Code query our LND node directly during development

**MCP Server Quick Setup (optional, for dev):**
```bash
# Build the MCP server (requires Go 1.24+)
~/.claude/skills/lightning-mcp-server/scripts/install.sh

# Add to Claude Code
~/.claude/skills/lightning-mcp-server/scripts/setup-claude-config.sh --scope project

# Or zero-install via npx:
claude mcp add --transport stdio lnc -- npx -y @lightninglabs/lightning-mcp-server
```

### Nunchuk — agent-skills (6 skills)

Source: [github.com/nunchuk-io/agent-skills](https://github.com/nunchuk-io/agent-skills)

| Skill | Purpose | When to Use |
|---|---|---|
| `nunchuk-setup` | Auth, network config, Electrum server | Initial setup, network switch |
| `nunchuk-wallet-creation` | Create multisig wallets via sandboxes | Creating the fallback L1 wallet |
| `nunchuk-invitations` | Invite participants to wallets | Multi-party wallet setup |
| `nunchuk-platform-key` | Spending limits, signing delays, auto-broadcast | Setting agent spending policies |
| `nunchuk-wallet-management` | List/inspect/export/recover wallets | Wallet operations |
| `nunchuk-wallet-transactions` | Create/sign/broadcast transactions | Sending bitcoin |

**When to use Nunchuk skills:** Only if the standard Taproot + Lightning approach hits blockers. These provide a fallback L1 custody model using Nunchuk's platform key for policy enforcement.

---

## References

- [PROJECT_SPEC.md](./PROJECT_SPEC.md) — full technical spec with demo script
- [Passkey PRF spec](https://github.com/breez/passkey-login/blob/main/spec.md)
- [LND Macaroons](https://docs.lightning.engineering/lightning-network-tools/lnd/macaroons)
- [litd Accounts](https://docs.lightning.engineering/lightning-network-tools/lightning-terminal/accounts)
- [L402 for Agents](https://lightning.engineering/posts/2026-03-11-L402-for-agents/)
- [Lightning Agent Tools](https://github.com/lightninglabs/lightning-agent-tools)
- [MCP Protocol](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [WebAuthn PRF](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/)
- [Nunchuk CLI](https://github.com/nunchuk-io/nunchuk-cli)
- [Nunchuk Agent Skills](https://github.com/nunchuk-io/agent-skills)
- [bolt402 SDK](https://github.com/lightninglabs/bolt402) — L402 client SDK (Rust/TS/Python/Go)
