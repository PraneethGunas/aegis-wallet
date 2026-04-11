# Aegis — The Agentic Bitcoin Wallet

A seedless Bitcoin wallet where an AI agent spends within cryptographically enforced budgets, the user approves large payments with biometrics, and on-chain everything looks like a normal single-sig transaction.

No seed phrase. No 24 words. Your keys live in your device's secure enclave, derived from a passkey. Face ID is your signature.

---

## How It Works

Aegis splits custody across two layers:

```
┌─────────────────────────────────────────────────┐
│  L1: SAVINGS (Self-Custody)                     │
│  CTV covenant vault on Bitcoin signet.          │
│  Your passkey-derived key controls it.           │
│  Server has ZERO access to vault funds.          │
│  Even if our servers die, you can recover.       │
├─────────────────────────────────────────────────┤
│  ↕ You move funds between layers (Face ID)      │
├─────────────────────────────────────────────────┤
│  L2: SPENDING (Custodial Lightning)             │
│  LND + litd node. Agent operates here.           │
│  Macaroon-enforced budget ceiling.               │
│  Exposure limited to spending balance only.      │
└─────────────────────────────────────────────────┘
```

**Layer 1 (Savings)** — A CTV covenant vault on Bitcoin Inquisition signet. Spending rules are enforced by Bitcoin consensus, not by a server. Your vault key is derived client-side from a WebAuthn passkey via the PRF extension. It never leaves your browser. Large withdrawals have a timelock with a clawback window — if something goes wrong, you can cancel.

**Layer 2 (Spending)** — An LND Lightning node wrapped by litd. Your AI agent gets a scoped macaroon (a cryptographic bearer token) with a hard spending ceiling enforced by LND's RPC middleware. Payments are instant. The agent can pay invoices, handle subscriptions, and tip — all within its budget. Anything above the limit triggers a biometric approval prompt.

**Passkey (Control Plane)** — WebAuthn PRF extension derives all keys from your device's secure enclave. No seed phrase is ever generated, shown, or stored. Recovery = passkey syncs to your new device, wallet regenerates deterministically.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   USER'S BROWSER                      │
│                                                        │
│  Secure Enclave ──→ Passkey (PRF) ──→ Key Derivation │
│                                                        │
│  vault_key:  m/86h/1h/0h/0/0  (Taproot, L1 signing) │
│  auth_key:   m/84h/1h/0h/0/0  (L2 authentication)   │
│                                                        │
│  CTV vault transactions signed HERE, in the browser.  │
│  Keys NEVER sent to the server.                        │
└──────────────────────┬───────────────────────────────┘
                       │ HTTPS / WSS
┌──────────────────────▼───────────────────────────────┐
│                   BACKEND SERVER                      │
│                                                        │
│  Node.js + Express API                                │
│  ├── Bitcoin Inquisition (signet) ← L1 vault UTXOs   │
│  ├── LND + litd ← L2 Lightning payments              │
│  └── Agent Runtime ← scoped macaroon, budget-limited │
└──────────────────────────────────────────────────────┘
```

### CTV Vault (Taproot Script Tree)

The on-chain vault uses four spending paths encoded in a Taproot script tree:

| Path | Who Signs | Conditions | Use Case |
|------|-----------|------------|----------|
| Leaf 1 | Agent | CTV-enforced template (exact outputs) | Small autonomous spends |
| Leaf 2 | User + Agent | CTV template + 6-block CSV delay | Large withdrawals |
| Leaf 3 | User only | 144-block (1 day) CSV timelock | Emergency recovery |
| Leaf 4 | User only | During Leaf 2 delay window | Clawback / cancel pending withdrawal |

The keypath is a MuSig2 aggregate of user + agent keys — cooperative spends look like ordinary single-sig Taproot transactions on-chain.

### Agent Budget Enforcement

```
Agent calls lnd.SendPayment(invoice) with its macaroon
  → LND RPC middleware checks: virtual balance >= amount + fees?
    YES → payment proceeds, balance deducted
    NO  → "insufficient balance" — payment rejected
  → Agent cannot see on-chain funds, node channels, or real balance
  → Agent cannot bake new macaroons or escalate permissions
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js + Tailwind CSS |
| Backend | Node.js + Express |
| Bitcoin | Bitcoin Inquisition 28.0 (signet) — CTV (BIP 119) + CSFS (BIP 348) |
| Lightning | LND v0.18+ wrapped by litd |
| Passkey | @simplewebauthn/browser + PRF extension |
| Tx Signing | bitcoinjs-lib + tiny-secp256k1 (in browser, never on server) |
| Database | SQLite (dev) / Postgres (prod) |

---

## Getting Started

### Prerequisites

- Node.js 22+ (`nvm install 22`)
- [Bitcoin Inquisition](https://github.com/bitcoin-inquisition/bitcoin/releases) (signet node with CTV + CSFS)
- [LND v0.18+](https://github.com/lightningnetwork/lnd/releases)
- [litd](https://github.com/lightninglabs/lightning-terminal/releases) (Lightning Terminal)

### 1. Start the Bitcoin Node

```bash
bitcoind -signet \
  -server \
  -rpcuser=aegis \
  -rpcpassword=<your-password> \
  -txindex=1 \
  -daemon

# Wait for sync (~10 min on signet)
bitcoin-cli -signet getblockchaininfo
```

### 2. Start LND + litd

```bash
litd --uipassword=<your-password> \
     --lnd-mode=integrated \
     --network=signet \
     --lnd.bitcoind.rpcuser=aegis \
     --lnd.bitcoind.rpcpass=<your-password>

# Create wallet (first run only)
lncli create
```

### 3. Fund with Signet Coins

Use a [signet faucet](https://signetfaucet.com) or Bitcoin Inquisition's `contrib/signet/getcoins.sh`.

### 4. Open a Lightning Channel

```bash
lncli openchannel --node_key <peer_pubkey> --local_amt 1000000
```

### 5. Start the Backend

```bash
cd backend
cp .env.example .env   # Edit with your credentials
npm install
npm run dev             # http://localhost:3001
```

### 6. Start the Frontend

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
LND_MACAROON_PATH=~/.lnd/data/chain/bitcoin/signet/admin.macaroon
BITCOIN_RPC_HOST=localhost
BITCOIN_RPC_PORT=38332
BITCOIN_RPC_USER=aegis
BITCOIN_RPC_PASS=<your-password>
LITD_HOST=localhost:8443
PORT=3001
```

---

## Project Structure

```
aegis/
├── backend/
│   ├── src/
│   │   ├── server.js              # Express + WebSocket server
│   │   ├── routes/                # API endpoints (auth, wallet, vault, agent)
│   │   ├── services/              # LND, litd, Bitcoin RPC, CTV, macaroon clients
│   │   ├── agent/                 # Agent runtime, scheduler, budget tracking
│   │   ├── ws/                    # WebSocket notifications
│   │   └── db/                    # Schema + data access
│   └── scripts/                   # Infrastructure setup scripts
├── web/
│   ├── src/
│   │   ├── app/                   # Next.js pages (dashboard, send, receive, vault, agent)
│   │   ├── lib/                   # Client-side crypto (passkey, bitcoin, vault-signer)
│   │   └── components/            # UI components (balance, tx list, agent budget, modals)
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
| `/auth/register` | POST | Register a new passkey public key |
| `/auth/login` | POST | Authenticate via WebAuthn |
| `/wallet/balance` | GET | Combined L1 + L2 balance |
| `/wallet/history` | GET | Unified transaction history |
| `/wallet/send` | POST | Route payment (Lightning or on-chain) |
| `/wallet/receive` | POST | Generate Lightning invoice or vault address |
| `/vault/deposit` | POST | Get CTV vault deposit address |
| `/vault/withdraw` | POST | Construct unsigned CTV spend (client signs) |
| `/vault/clawback` | POST | Construct clawback tx (client signs) |
| `/vault/fund-ln` | POST | Move funds from vault to Lightning |
| `/agent/create` | POST | Create litd account + scoped macaroon |
| `/agent/topup` | POST | Increase agent budget (requires biometric auth) |
| `/agent/pause` | POST | Freeze agent macaroon |
| `/agent/status` | GET | Agent budget + activity log |

---

## Key Concepts

### Passkey Key Derivation

```
WebAuthn PRF(credential, salt="aegis-wallet-v1") → 32 bytes entropy
  → BIP39 mnemonic (never displayed) → BIP32 master key
  → vault_key:  m/86h/1h/0h/0/0  (Taproot, signet)
  → auth_key:   m/84h/1h/0h/0/0  (SegWit, signet)
```

Recovery: passkey syncs via iCloud/Google → same entropy → same keys → wallet restored.

### Macaroon-Scoped Agent

The agent holds a litd account macaroon with these permissions:

| Allowed | Denied |
|---------|--------|
| `offchain:write` — pay Lightning invoices | `onchain:*` — no on-chain access |
| `offchain:read` — view own payments | `peers:*` — no node topology access |
| `invoices:write` — create invoices | `macaroon:*` — cannot bake new tokens |
| `invoices:read` — check invoice status | Cannot see real node balance or channels |

### Clawback Mechanism

Large vault withdrawals (Leaf 2) have a 6-block CSV delay before settlement. During this window, the user can broadcast a clawback transaction (Leaf 4) to cancel the withdrawal and return funds to the vault. This is enforced by Bitcoin Script — no server can override it.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and pull request guidelines.

---

## Security

Vault signing keys are derived client-side and never leave the browser. See [SECURITY.md](SECURITY.md) for the full security model and responsible disclosure policy.

---

## License

[MIT](LICENSE)

---

## References

- [CTV (BIP 119)](https://bitcoinops.org/en/topics/op_checktemplateverify/) — `OP_CHECKTEMPLATEVERIFY` specification
- [CSFS (BIP 348)](https://bitcoinops.org/en/topics/op_checksigfromstack/) — `OP_CHECKSIGFROMSTACK` specification
- [Bitcoin Inquisition](https://github.com/bitcoin-inquisition/bitcoin/releases) — Signet fork with CTV + CSFS active
- [WebAuthn PRF Extension](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/) — Passkey-based key derivation
- [LND Macaroons](https://docs.lightning.engineering/lightning-network-tools/lnd/macaroons) — Scoped authentication tokens
- [litd Accounts](https://docs.lightning.engineering/lightning-network-tools/lightning-terminal/accounts) — Virtual Lightning accounts
- [L402 for Agents](https://lightning.engineering/posts/2026-03-11-L402-for-agents/) — Agent payment protocol
- [Lightning Agent Tools](https://github.com/lightninglabs/lightning-agent-tools) — Claude Code skills for Lightning
- [MuSig2 (BIP 327)](https://bitcoinops.org/en/topics/musig/) — Aggregate key signing
- [Passkey PRF Spec (Breez)](https://github.com/breez/passkey-login/blob/main/spec.md) — Reference implementation
