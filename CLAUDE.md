# Aegis — Agentic Bitcoin Wallet

## What This Is

A seedless Bitcoin wallet with two-layer custody: L1 self-custodial CTV covenant vault + L2 custodial Lightning with macaroon-enforced agent budgets. User authenticates with passkeys (WebAuthn PRF). AI agent operates autonomously on L2 within cryptographic spending limits.

Full spec: `PROJECT_SPEC.md`

---

## Architecture (TL;DR)

```
L1 (Savings, SELF-CUSTODY):  CTV vault on Bitcoin Inquisition signet
                              User signs in browser via passkey-derived key
                              Server has ZERO access to vault funds

L2 (Spending, CUSTODIAL):    LND + litd on our server
                              Agent gets scoped macaroon with budget ceiling
                              User explicitly funds L2 from L1

Control Plane:               WebAuthn passkey (PRF extension)
                              Derives vault key (L1) + auth key (L2)
                              No seed phrase ever shown to user
```

---

## Tech Stack

- **Frontend:** Next.js (React) + Tailwind CSS — web app is primary target
- **Backend:** Node.js + Express — REST API + WebSocket
- **Bitcoin:** Bitcoin Inquisition 28.0 (signet) — CTV (BIP 119) + CSFS (BIP 348)
- **Lightning:** LND v0.18+ wrapped by litd — accounts, macaroon bakery
- **Passkey:** @simplewebauthn/browser + PRF extension (client-side key derivation)
- **Tx Signing:** bitcoinjs-lib + bip39 + tiny-secp256k1 (in browser, never on server)
- **Database:** SQLite or Postgres — user accounts, agent configs, vault UTXOs, tx history
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
│   │   ├── server.js              # Express + WebSocket
│   │   ├── routes/
│   │   │   ├── auth.js            # WebAuthn register + login
│   │   │   ├── wallet.js          # Balance, send/receive, history
│   │   │   ├── vault.js           # CTV vault: deposit, withdraw, clawback, fund-ln
│   │   │   └── agent.js           # Agent: create, topup, pause, status
│   │   ├── services/
│   │   │   ├── lnd.js             # LND gRPC client
│   │   │   ├── litd.js            # litd account management
│   │   │   ├── bitcoin.js         # Bitcoin Inquisition RPC
│   │   │   ├── ctv.js             # CTV + CSFS tx construction
│   │   │   ├── vault.js           # Taproot script tree builder
│   │   │   ├── macaroon.js        # Macaroon baking + attenuation
│   │   │   └── passkey.js         # WebAuthn server-side verification
│   │   ├── agent/
│   │   │   ├── runtime.js         # Agent main loop
│   │   │   ├── scheduler.js       # Recurring payment scheduler
│   │   │   ├── budget.js          # Budget tracking + top-up requests
│   │   │   └── tasks.js           # Task definitions
│   │   ├── ws/
│   │   │   └── notifications.js   # WebSocket server
│   │   └── db/
│   │       ├── schema.sql
│   │       └── index.js
│   └── scripts/
│       ├── setup-lnd.sh
│       ├── setup-inquisition.sh
│       └── fund-wallet.sh
├── web/                            # Next.js (primary frontend)
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.jsx
│   │   │   ├── page.jsx           # Landing / onboarding
│   │   │   ├── dashboard/page.jsx # Main wallet view
│   │   │   ├── send/page.jsx
│   │   │   ├── receive/page.jsx
│   │   │   ├── vault/page.jsx     # Vault management
│   │   │   ├── agent/page.jsx     # Agent dashboard
│   │   │   └── settings/page.jsx
│   │   ├── lib/
│   │   │   ├── passkey.js         # WebAuthn PRF key derivation (CLIENT-SIDE)
│   │   │   ├── bitcoin.js         # bitcoinjs-lib key derivation (CLIENT-SIDE)
│   │   │   ├── vault-signer.js    # CTV vault tx signing (CLIENT-SIDE, keys never leave browser)
│   │   │   ├── api.js             # REST client
│   │   │   └── ws.js              # WebSocket client
│   │   └── components/
│   │       ├── Balance.jsx        # Unified L1+L2 balance (USD primary)
│   │       ├── TxList.jsx         # Transaction history (agent-tagged)
│   │       ├── AgentBudget.jsx    # Budget progress bar
│   │       ├── ApprovalModal.jsx  # Biometric approval modal
│   │       ├── VaultStatus.jsx    # Vault balance + pending withdrawals
│   │       └── ClawbackTimer.jsx  # Countdown for clawback window
│   └── public/
└── docs/
    ├── PITCH_DECK.md
    └── DEMO_SCRIPT.md
```

---

## Critical Security Rules

- **Vault signing keys (L1) are derived client-side via WebAuthn PRF and NEVER sent to the server.** All CTV vault transactions are signed in the browser.
- **Never log, store, or transmit mnemonics, xprv values, or raw PRF entropy.** These exist only in browser memory during signing, then are discarded.
- **Agent operates on L2 only.** It holds a scoped macaroon. It cannot access L1 vault, see node topology, or bake new macaroons.
- **Never commit `.env` files, macaroon files, or any secrets to git.**

---

## Environment

- **Node.js:** v22.17.0 (via nvm)
- **npm:** 11.6.0
- **Network:** Bitcoin Inquisition signet (CTV+CSFS active)
- **nunchuk-cli:** v0.1.0 (installed globally) — fallback if CTV hits blockers
- **Nunchuk auth:** praneethgunasekaran@gmail.com

### Environment Variables (backend/.env)

```bash
LND_HOST=localhost:10009
LND_CERT_PATH=~/.lnd/tls.cert
LND_MACAROON_PATH=~/.lnd/data/chain/bitcoin/signet/admin.macaroon
BITCOIN_RPC_HOST=localhost
BITCOIN_RPC_PORT=38332
BITCOIN_RPC_USER=aegis
BITCOIN_RPC_PASS=aegis123
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
→ vault_key:   m/86h/1h/0h/0/0  (Taproot, signet)
→ signing_key: m/84h/1h/0h/0/0  (Native SegWit, signet)
→ nonce_seed:  HMAC-SHA256(master, "aegis-nonce-chain")
```

### CTV Vault (Taproot Script Tree)

```
Keypath: MuSig2(user_vault_key, agent_key) — cooperative spend

Leaf 1: Agent small spend
  <agent_key> CHECKSIG + <template_hash> CTV
  → CTV enforces exact outputs. No timelock.

Leaf 2: User + agent large spend
  2-of-2 CHECKSIG + <template_hash> CTV
  → CSV 6-block delay before settlement

Leaf 3: User emergency sweep
  <user_vault_key> CHECKSIG + CSV 144 blocks (1 day)
  → User alone, last resort recovery

Leaf 4: Clawback (during Leaf 2 delay)
  <user_vault_key> CHECKSIG
  → Cancels pending large withdrawal
```

### Lightning Agent (litd accounts)

```bash
# Create agent account
litcli accounts create 50000 --save_to /tmp/agent.macaroon

# Agent macaroon permissions:
# ✓ offchain:write, offchain:read, invoices:write, invoices:read
# ✗ onchain:*, peers:*, macaroon:*

# Enforcement: LND RPC middleware checks virtual balance on every payment
```

### API Endpoints

```
POST /auth/register     — register passkey public key
POST /auth/login        — WebAuthn authentication
GET  /wallet/balance    — combined L1+L2 balance
GET  /wallet/history    — unified tx history
POST /wallet/send       — route payment (LN or on-chain)
POST /wallet/receive    — generate LN invoice or vault address
POST /vault/deposit     — return CTV vault address
POST /vault/withdraw    — construct unsigned CTV spend (client signs)
POST /vault/clawback    — construct clawback tx (client signs)
POST /vault/fund-ln     — vault → LN channel (on-chain, client signs)
POST /agent/create      — create litd account + macaroon
POST /agent/topup       — increase agent budget (requires auth)
POST /agent/pause       — freeze agent macaroon
GET  /agent/status      — budget + activity
```

---

## Nunchuk CLI (Fallback for L1)

If Bitcoin Inquisition / CTV setup hits blockers, use Nunchuk's platform key for L1 policy enforcement on testnet:

```bash
nunchuk sandbox create --name "Aegis Vault" --m 2 --n 3
nunchuk sandbox add-key <sandbox-id> --slot 0 --fingerprint <user_xfp>
nunchuk sandbox add-key <sandbox-id> --slot 1 --fingerprint <agent_xfp>
nunchuk sandbox platform-key enable <sandbox-id>
nunchuk sandbox platform-key set-policy <sandbox-id> \
  --auto-broadcast --limit-amount 10 --limit-currency USD --limit-interval DAILY
nunchuk sandbox finalize <sandbox-id>
```

Full Nunchuk CLI reference: see git history for previous CLAUDE.md version, or `nunchuk --help`.

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
2. CTV vault on Inquisition signet (Taproot script tree, client-side signing)
3. Vault deposit + balance display
4. Fund Lightning from vault (biometric approval)
5. Agent with macaroon-enforced budget (L2)
6. Agent budget enforcement (overspend denied)
7. User approval for large L2 payment (websocket + biometric)
8. Unified balance display (L1 savings + L2 spending, USD)
9. Vault clawback demo (timelock + cancel)

### Nice to Have

- CSFS dynamic amounts
- Agent delegation (attenuated sub-macaroons)
- Mobile app (React Native + Expo)
- BIP 89 blind signing
- Silent Payments (BIP 352)

---

## Infrastructure Setup

```bash
# 1. Bitcoin Inquisition signet
bitcoind -signet -server -rpcuser=aegis -rpcpassword=aegis123 -txindex=1 -daemon

# 2. LND
lnd --bitcoin.signet --bitcoin.node=bitcoind \
    --bitcoind.rpchost=localhost --bitcoind.rpcuser=aegis --bitcoind.rpcpass=aegis123

# 3. litd (wraps LND)
litd --uipassword=aegis123 --lnd-mode=integrated --network=signet

# 4. Create LND wallet
lncli create

# 5. Open channel (after funding with signet coins)
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

**When to use Nunchuk skills:** Only if Bitcoin Inquisition / CTV setup hits blockers. These provide a fallback L1 custody model using Nunchuk's platform key instead of CTV covenants. See "Nunchuk CLI (Fallback for L1)" section above.

---

## References

- [PROJECT_SPEC.md](./PROJECT_SPEC.md) — full technical spec with demo script
- [Passkey PRF spec](https://github.com/breez/passkey-login/blob/main/spec.md)
- [LND Macaroons](https://docs.lightning.engineering/lightning-network-tools/lnd/macaroons)
- [litd Accounts](https://docs.lightning.engineering/lightning-network-tools/lightning-terminal/accounts)
- [L402 for Agents](https://lightning.engineering/posts/2026-03-11-L402-for-agents/)
- [Lightning Agent Tools](https://github.com/lightninglabs/lightning-agent-tools)
- [CTV (BIP 119)](https://bitcoinops.org/en/topics/op_checktemplateverify/)
- [CSFS (BIP 348)](https://bitcoinops.org/en/topics/op_checksigfromstack/)
- [Bitcoin Inquisition](https://github.com/bitcoin-inquisition/bitcoin/releases)
- [Nunchuk CLI](https://github.com/nunchuk-io/nunchuk-cli)
- [Nunchuk Agent Skills](https://github.com/nunchuk-io/agent-skills)
- [WebAuthn PRF](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/)
- [bolt402 SDK](https://github.com/lightninglabs/bolt402) — L402 client SDK (Rust/TS/Python/Go)
