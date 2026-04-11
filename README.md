# Aegis — The Agentic Bitcoin Wallet

A seedless Bitcoin wallet where Claude is your AI financial agent — spending within cryptographically enforced Lightning budgets, hitting real budget walls, and escalating to your biometric approval when it needs more.

No seed phrase. No 24 words. Your keys live in your device's secure enclave, derived from a passkey. Face ID is your signature.

---

## How It Works

Aegis splits custody across two layers:

```
┌─────────────────────────────────────────────────┐
│  L1: FUNDING WALLET (Self-Custody)              │
│  Standard Taproot address on testnet.            │
│  Passkey derives your key AND signs txs.         │
│  Server has ZERO access to funding wallet.       │
├─────────────────────────────────────────────────┤
│  ↕ You move funds between layers (Face ID)      │
├─────────────────────────────────────────────────┤
│  L2: SPENDING (Custodial Lightning)             │
│  LND + litd node. Claude operates here via MCP. │
│  Passkey = auth only. LND holds signing keys.    │
│  Macaroon-enforced budget ceiling.               │
│  Exposure limited to spending balance only.      │
└─────────────────────────────────────────────────┘
```

**Layer 1 (Funding)** — A standard Taproot address on Bitcoin testnet. Your passkey derives the private key AND signs all on-chain transactions — the passkey IS the key. It never leaves your browser. This is a simple self-custody funding wallet. No covenants, no multi-sig, no agent involvement. If our server disappears, you still have your key.

**Layer 2 (Spending)** — An LND Lightning node wrapped by litd. Claude gets wallet tools via an MCP server backed by a scoped macaroon (a cryptographic bearer token) with a hard spending ceiling enforced by LND's RPC middleware. Payments are instant. Claude can pay invoices, check balances, and request more budget — all within its ceiling. Anything above the limit triggers a biometric approval prompt. The passkey authenticates you to our backend on L2 but does NOT sign Lightning transactions — LND holds those keys.

**Passkey (Control Plane)** — WebAuthn PRF extension derives keys from your device's secure enclave. No seed phrase is ever generated, shown, or stored. On L1, the passkey derives the key and signs. On L2, the passkey authenticates. The passkey credential ID IS the user identity — no separate account or login. Recovery = passkey syncs to your new device, wallet regenerates deterministically.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   USER'S BROWSER                      │
│                                                        │
│  Secure Enclave ──→ Passkey (PRF) ──→ Key Derivation │
│                                                        │
│  funding_key:  m/86h/1h/0h/0/0  (Taproot, L1 signer)│
│  auth_key:     m/84h/1h/0h/0/0  (L2 auth only)      │
│                                                        │
│  On-chain transactions signed HERE, in the browser.   │
│  Keys NEVER sent to the server.                        │
└──────────────────────┬───────────────────────────────┘
                       │ HTTPS / WSS
┌──────────────────────▼───────────────────────────────┐
│                   BACKEND SERVER                      │
│                                                        │
│  Node.js + Express API                                │
│  ├── LND + litd ← L2 Lightning payments              │
│  ├── MCP Server ← exposes wallet tools to Claude     │
│  └── Scoped macaroon ← budget-limited, server-side   │
└──────────────────────────────────────────────────────┘

┌──────────────────────┐         ┌──────────────────────┐
│  Claude               │  MCP   │  Aegis MCP Server     │
│  (Code / Cowork /     │◄──────►│  ├─ pay_invoice       │
│   Chat + MCP)         │        │  ├─ get_balance       │
│                        │        │  ├─ request_topup     │
│  Claude IS the agent.  │        │  └─ macaroon (hidden) │
└──────────────────────┘         └──────────────────────┘
```

### Agent Budget Enforcement

```
Claude calls pay_invoice via MCP
  → MCP server attaches scoped macaroon to LND RPC call
  → LND RPC middleware checks: virtual balance >= amount + fees?
    YES → payment proceeds, balance deducted
    NO  → "insufficient balance" — payment rejected
  → Claude sees the denial, calls request_topup → user gets biometric prompt
  → Agent cannot see on-chain funds, node channels, or real balance
  → Agent cannot bake new macaroons or escalate permissions
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js + Tailwind CSS |
| Backend | Node.js + Express |
| AI Agent | Claude (user's subscription) — no custom agent runtime |
| MCP Server | Node.js (@modelcontextprotocol/sdk) |
| Lightning | LND v0.18+ wrapped by litd |
| Passkey | @simplewebauthn/browser + PRF extension |
| Tx Signing | bitcoinjs-lib + tiny-secp256k1 (in browser, never on server) |
| Database | SQLite (dev) / Postgres (prod) |
| Network | Bitcoin testnet |

---

## Getting Started

### Prerequisites

- Node.js 22+ (`nvm install 22`)
- [LND v0.18+](https://github.com/lightningnetwork/lnd/releases)
- [litd](https://github.com/lightninglabs/lightning-terminal/releases) (Lightning Terminal)

### 1. Start LND + litd

```bash
# Start LND on testnet
lnd --bitcoin.testnet --bitcoin.node=neutrino --debuglevel=info

# Create wallet (first run only)
lncli create

# Start litd (wraps LND for account system)
litd --uipassword=<your-password> \
     --lnd-mode=integrated \
     --network=testnet
```

### 2. Fund with Testnet Coins

```bash
lncli newaddress p2tr
# Send testnet coins to this address from a faucet
```

### 3. Open a Lightning Channel

```bash
lncli openchannel --node_key <peer_pubkey> --local_amt 1000000
```

### 4. Start the Backend

```bash
cd backend
cp .env.example .env   # Edit with your credentials
npm install
npm run dev             # http://localhost:3001
```

### 5. Start the Frontend

```bash
cd web
npm install
npm run dev             # http://localhost:3000
```

### Environment Variables

Create `backend/.env` from the example:

```bash
LND_HOST=localhost:10009
LND_CERT_PATH=~/.lnd/tls.cert
LND_MACAROON_PATH=~/.lnd/data/chain/bitcoin/testnet/admin.macaroon
LITD_HOST=localhost:8443
PORT=3001
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## Project Structure

```
aegis/
├── backend/
│   ├── src/
│   │   ├── server.js              # Express + WebSocket server
│   │   ├── routes/                # API endpoints (wallet, agent, ln)
│   │   ├── services/              # LND, litd, macaroon, passkey
│   │   ├── mcp/                   # MCP server, tools, auth, pairing
│   │   ├── ws/                    # WebSocket notifications
│   │   └── db/                    # Schema + data access
│   └── scripts/                   # Infrastructure setup scripts
├── web/
│   ├── src/
│   │   ├── app/                   # Next.js pages (dashboard, send, receive, agent)
│   │   ├── lib/                   # Client-side crypto (passkey, bitcoin)
│   │   └── components/            # UI components (balance, tx list, agent budget, pairing QR)
│   └── public/
├── docs/
│   ├── PITCH_DECK.md
│   └── DEMO_SCRIPT.md
├── CLAUDE.md                      # Claude Code instructions
├── PROJECT_SPEC.md                # Full technical specification
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/wallet/create` | POST | Store passkey credential ID + public key (wallet creation IS identity) |
| `/wallet/balance` | GET | Combined L1 + L2 balance |
| `/wallet/history` | GET | Unified transaction history |
| `/wallet/send` | POST | Send on-chain tx (user signs in browser) |
| `/wallet/receive` | POST | Generate Lightning invoice or funding address |
| `/agent/create` | POST | Create litd account + scoped macaroon |
| `/agent/pair` | POST | Generate MCP pairing config + QR |
| `/agent/topup` | POST | Increase agent budget (requires WebAuthn assertion) |
| `/agent/pause` | POST | Freeze agent macaroon |
| `/agent/status` | GET | Agent budget + activity log |
| `/ln/fund` | POST | Construct unsigned tx to fund LN (client signs) |
| `/ln/withdraw` | POST | Withdraw LN balance to on-chain address |

Auth: Every request includes a WebAuthn assertion or short-lived token from a recent assertion. The passkey credential ID IS the user identity. No separate register/login flow.

---

## Key Concepts

### Passkey Key Derivation

```
WebAuthn PRF(credential, salt="aegis-wallet-v1") → 32 bytes entropy
  → BIP39 mnemonic (never displayed) → BIP32 master key
  → funding_key:  m/86h/1h/0h/0/0  (Taproot, testnet — signs L1 txs)
  → auth_key:     m/84h/1h/0h/0/0  (testnet — L2 auth only)
```

Recovery: passkey syncs via iCloud/Google → same entropy → same keys → wallet restored.

### Passkey Roles Per Layer

| Layer | Passkey Role | What It Does |
|-------|-------------|-------------|
| L1 (Funding) | **Key + Signer** | Derives private key via PRF, signs on-chain txs in browser |
| L2 (Spending) | **Auth only** | Authenticates to backend via WebAuthn. LND holds Lightning signing keys. |

### Macaroon-Scoped Agent

The agent holds a litd account macaroon (via MCP server — never directly) with these permissions:

| Allowed | Denied |
|---------|--------|
| `offchain:write` — pay Lightning invoices | `onchain:*` — no on-chain access |
| `offchain:read` — view own payments | `peers:*` — no node topology access |
| `invoices:write` — create invoices | `macaroon:*` — cannot bake new tokens |
| `invoices:read` — check invoice status | Cannot see real node balance or channels |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and pull request guidelines.

---

## Security

Funding wallet signing keys are derived client-side and never leave the browser. On L2, the passkey authenticates but does not sign — LND holds those keys. See [SECURITY.md](SECURITY.md) for the full security model and responsible disclosure policy.

---

## License

[MIT](LICENSE)

---

## References

- [WebAuthn PRF Extension](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/) — Passkey-based key derivation
- [LND Macaroons](https://docs.lightning.engineering/lightning-network-tools/lnd/macaroons) — Scoped authentication tokens
- [litd Accounts](https://docs.lightning.engineering/lightning-network-tools/lightning-terminal/accounts) — Virtual Lightning accounts
- [L402 for Agents](https://lightning.engineering/posts/2026-03-11-L402-for-agents/) — Agent payment protocol
- [Lightning Agent Tools](https://github.com/lightninglabs/lightning-agent-tools) — Claude Code skills for Lightning
- [MCP Protocol](https://modelcontextprotocol.io/) — Model Context Protocol
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — MCP SDK
- [Passkey PRF Spec (Breez)](https://github.com/breez/passkey-login/blob/main/spec.md) — Reference implementation
