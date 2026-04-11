# Aegis — The Agentic Bitcoin Wallet

## One-Line Pitch

A seedless Bitcoin wallet where an AI agent spends within cryptographically enforced budgets, the user approves large payments with Face ID, and on-chain everything looks like a normal single-sig transaction.

---

## Elevator Pitch (30 seconds)

We built a Bitcoin wallet where you never see a private key. Your keys live in your phone's secure enclave, derived from a passkey — Face ID is your signature. An AI assistant handles small payments autonomously (subscriptions, tips, DCA) within a daily budget enforced by Lightning macaroons. Anything bigger triggers a Face ID prompt. On Layer 1, a CTV covenant vault ensures even a compromised agent can't drain your savings — Bitcoin consensus itself rejects unauthorized transactions. On-chain, every transaction looks like a normal Taproot single-sig spend. The custodian co-signs blindly. Nobody learns your balance. The agent has a budget and a job. You have a passkey and veto power.

---

## The Problem

1. **Seed phrases are hostile UX.** 70%+ of normal users cannot securely manage a 24-word recovery phrase. This is the single biggest barrier to Bitcoin self-custody adoption.
2. **AI agents need to transact, but giving them keys is terrifying.** There's no standard way to give an AI agent bounded spending authority over Bitcoin — it's either full access or nothing.
3. **Collaborative custody leaks privacy.** When a custodian co-signs, they typically see your full balance, transaction history, and spending patterns.
4. **Multisig is invisible tax on UX.** Two signing rounds, nonce exchange, PSBT coordination — the user shouldn't know or care about any of this.

## The Solution

A two-layer wallet architecture with a clear custody split:

- **L1 (Savings — Self-Custody):** CTV + CSFS covenant vault on Bitcoin Inquisition signet. User's passkey-derived key controls it directly — no server, no custodian, no co-signer needed. Large withdrawals have a timelock + clawback window. Agent cannot touch this layer without user approval. Spending rules enforced by Bitcoin consensus itself.
- **L2 (Spending — Custodial):** LND + litd Lightning node operated by us. Agent gets a macaroon-scoped account with a hard budget ceiling. Payments are instant. Budget is enforced by LND's RPC middleware. This layer is custodial (we run the node), but exposure is limited to the spending balance the user explicitly moves from L1. Think of it as a checking account funded from your own vault.
- **Passkey (Control Plane):** WebAuthn PRF extension derives all keys from the device's secure enclave. No seed phrase. Recovery = passkey syncs to new device, wallet regenerates. The passkey is the bridge between layers — it controls the self-custodial vault AND authenticates to the custodial Lightning account.

**Custody Model:**

```
┌─────────────────────────────────────────────────┐
│  L1: SELF-CUSTODY (user's keys, Bitcoin rules)  │
│  CTV vault on-chain. User signs with passkey.   │
│  We have ZERO access. Even if our servers die,  │
│  user can sweep via timelock recovery path.     │
├─────────────────────────────────────────────────┤
│  User moves funds down (requires Face ID)       │
│  ↓ On-chain tx from vault → LN channel open     │
├─────────────────────────────────────────────────┤
│  L2: CUSTODIAL (our node, macaroon-enforced)    │
│  LND + litd. We run it. Agent operates here.    │
│  Exposure limited to spending balance only.     │
│  User can withdraw back to L1 at any time.      │
└─────────────────────────────────────────────────┘
```

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                     USER'S BROWSER (Web App)                    │
│                                                                  │
│  ┌──────────────────┐  ┌─────────────────────────────────────┐ │
│  │  Device Secure    │  │        Next.js Web App               │ │
│  │  Enclave          │  │                                     │ │
│  │                    │  │  - WebAuthn biometric prompt        │ │
│  │  Passkey           │  │  - Balance display (fiat primary)  │ │
│  │  PRF Extension     │  │  - Send / receive UI                │ │
│  │  HMAC-SHA-256      │  │  - Agent dashboard + activity log  │ │
│  │                    │  │  - Approval modals (large payments) │ │
│  │  Derives:          │  │  - Settings                        │ │
│  │  - vault key (L1)  │  │                                     │ │
│  │  - auth key (L2)   │  │  Communicates with backend via:    │ │
│  │                    │  │  - REST API (all operations)       │ │
│  └──────────────────┘  │  - WebSocket (live updates)         │ │
│                          └─────────────────────────────────────┘ │
│                                                                  │
│  KEY POINT: Vault signing key (L1) derived client-side via PRF. │
│  Never sent to server. On-chain tx signed IN THE BROWSER.       │
│  L2 auth key authenticates to our backend — custodial layer.    │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                     HTTPS / WSS
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                        BACKEND SERVER                             │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                    API Server (Node.js)                       ││
│  │                                                               ││
│  │  Endpoints:                                                   ││
│  │  POST /auth/register     → registers passkey public key       ││
│  │  POST /auth/login        → authenticates via WebAuthn         ││
│  │  POST /wallet/receive    → generates LN invoice / vault addr  ││
│  │  POST /wallet/send       → routes payment (LN or on-chain)   ││
│  │  POST /agent/create      → creates litd account + macaroon    ││
│  │  POST /agent/topup       → increases agent budget (needs auth)││
│  │  POST /agent/pause       → freezes agent macaroon             ││
│  │  GET  /wallet/balance    → combined L1+L2 balance             ││
│  │  GET  /wallet/history    → unified transaction history        ││
│  │  GET  /agent/status      → agent budget + activity            ││
│  │  POST /vault/deposit     → returns CTV vault address          ││
│  │  POST /vault/withdraw    → constructs unsigned CTV spend      ││
│  │                            (client signs with passkey-derived  ││
│  │                             key, sends signed tx back)         ││
│  │  POST /vault/clawback    → constructs clawback tx for signing ││
│  │  POST /vault/fund-ln     → vault → LN (on-chain, needs sig)  ││
│  └────────────┬──────────────────────┬───────────────────────────┘│
│               │                      │                             │
│  ┌────────────▼──────────┐  ┌───────▼──────────────────────────┐ │
│  │  LND + litd            │  │  Bitcoin Inquisition Node        │ │
│  │  (CUSTODIAL L2)        │  │  (signet — SELF-CUSTODY L1)     │ │
│  │                        │  │                                  │ │
│  │  - Lightning payments  │  │  - CTV (BIP 119) active         │ │
│  │  - Account system      │  │  - CSFS (BIP 348) active        │ │
│  │  - Macaroon bakery     │  │  - Vault UTXO tracking          │ │
│  │  - RPC middleware      │  │  - Tx construction (unsigned)    │ │
│  │  - Channel management  │  │  - Broadcast signed txs          │ │
│  │                        │  │                                  │ │
│  │  We control this.      │  │  Vault script (Taproot):        │ │
│  │  User trusts us with   │  │  - Leaf 1: agent + CTV (small)  │ │
│  │  spending balance only. │  │  - Leaf 2: agent + user (large) │ │
│  │                        │  │  - Leaf 3: user + timelock      │ │
│  │  Accounts:             │  │                                  │ │
│  │  - User (LNC session)  │  │  User controls this.            │ │
│  │  - Agent (scoped mac)  │  │  We cannot spend vault funds.   │ │
│  └────────────────────────┘  │  User signs in browser.         │ │
│                               └──────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                    AI Agent Runtime                           │ │
│  │                                                               │ │
│  │  - Holds scoped macaroon (pay + invoice within budget)       │ │
│  │  - Operates ONLY on L2 (Lightning, custodial layer)          │ │
│  │  - Cannot access L1 vault (no signing key, no on-chain perms)│ │
│  │  - Cannot see node topology or real balance                   │ │
│  │  - Can delegate sub-macaroons to sub-agents                  │ │
│  │  - Requests budget top-up → websocket notification to user   │ │
│  │  - Pays Lightning invoices, L402 APIs                         │ │
│  │  - Tags each payment with purpose description                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend

| Component | Technology | Purpose |
|---|---|---|
| API Server | Node.js + Express | REST API connecting phone app to infrastructure |
| Bitcoin Node | Bitcoin Inquisition 28.0 (signet) | CTV + CSFS covenant support |
| Lightning Node | LND v0.18+ | Lightning payments, channels |
| Lightning Terminal | litd (wrapping LND) | Account system, macaroon management |
| AI Agent | Node.js process with LND gRPC client | Autonomous Lightning payments |
| Database | SQLite or Postgres | User accounts, agent configs, tx history |

### Web App (Primary — Hackathon)

| Component | Technology | Purpose |
|---|---|---|
| Framework | Next.js (React) | Web application, SSR for initial load |
| Styling | Tailwind CSS | Fast, clean UI for demos |
| Passkey | @simplewebauthn/browser + PRF extension | Key derivation from device secure enclave |
| Biometrics | WebAuthn user verification (triggers Face ID / Touch ID / Windows Hello) | User approval for payments + vault signing |
| Backend Comms | REST API + WebSocket | API calls + live agent activity updates |
| Key Derivation | bitcoinjs-lib + bip39 + tiny-secp256k1 (in browser) | Vault signing keys derived client-side |
| Tx Signing | bitcoinjs-lib (in browser) | CTV vault transactions signed client-side, never on server |
| Deployment | Vercel or localhost:3000 | Shareable URL for judges |

### Mobile App (Stretch Goal — If Time Permits)

| Component | Technology | Purpose |
|---|---|---|
| Framework | React Native + Expo | Real app on phone for demo wow factor |
| Passkey | WebView bridge for PRF ceremony | System biometric prompt, PRF in WebView |
| Everything else | Same API, same components adapted | Reuses backend entirely |

### Hackathon Simplification

For the POC, several things can be simplified:

| Full Version | Hackathon POC |
|---|---|
| Multiple LND nodes (per user) | Single shared LND node, multiple litd accounts |
| CTV vault with recursive covenants | Pre-constructed CTV transaction tree (2-3 levels deep) |
| AI agent with full LLM reasoning | Scripted agent that auto-pays invoices on schedule |
| Production LND in cloud | LND on laptop connected to Inquisition signet |
| Mobile native app | Web app (Next.js), mobile as stretch goal |

---

## Detailed Technical Spec

### 1. Passkey Key Derivation (PRF)

**Setup (once during wallet creation):**

```
1. User triggers WebAuthn credential creation (Face ID prompt)
2. PRF extension generates deterministic secret:
   raw_entropy = PRF(passkey_credential, salt="aegis-wallet-v1")
   → 32 bytes from HMAC-SHA-256 inside secure enclave

3. Derive Bitcoin keys via standard BIP39/BIP32:
   mnemonic = BIP39_from_entropy(raw_entropy)  // 24 words (never shown to user)
   seed = PBKDF2(mnemonic, "mnemonic")
   master_key = BIP32_master(seed)

4. Derive purpose-specific child keys:
   signing_key    = master_key / 84h / 1h / 0h / 0 / 0   (signet, native segwit)
   vault_key      = master_key / 86h / 1h / 0h / 0 / 0   (signet, taproot)
   nonce_seed     = HMAC-SHA256(master_key, "aegis-nonce-chain")
```

**At signing time:**

```
1. Face ID prompt → passkey authentication
2. PRF(passkey, "aegis-wallet-v1") → same 32 bytes
3. Re-derive the specific key needed
4. Sign transaction
5. Discard all key material from memory
```

**Recovery:**

```
1. New phone → sign into Apple/Google account → passkey syncs
2. Open app → Face ID → PRF produces same entropy
3. Same keys derived → wallet restored
4. Backend recognizes public key → account reconnected
```

**Fallback if PRF unavailable:**

```
1. Generate random entropy
2. Encrypt to device secure enclave (Keychain / KeyStore)
3. Offer optional encrypted cloud backup (iCloud Keychain)
4. User experience identical — only recovery path differs
```

### 2. CTV Vault (L1 On-Chain)

**Vault Creation Script (Taproot):**

```
Keypath: MuSig2(user_vault_key, agent_key)
  → Cooperative spend when both agree (cheapest, most private)

Script tree (Taproot leaves):
  Leaf 1: "Agent small spend"
    <agent_key> OP_CHECKSIG
    <template_hash_small> OP_CHECKTEMPLATEVERIFY
    → Agent signs, CTV enforces: output 1 = payment (≤ threshold),
      output 2 = change back to new vault (same script, recursive)
    → No timelock

  Leaf 2: "User + agent large spend"
    <user_vault_key> OP_CHECKSIG
    <agent_key> OP_CHECKSIGADD
    OP_2 OP_NUMEQUAL
    <template_hash_large> OP_CHECKTEMPLATEVERIFY
    → Both must sign. CTV enforces change back to vault.
    → Output has CSV timelock (6 blocks) before final settlement

  Leaf 3: "User emergency sweep"
    <user_vault_key> OP_CHECKSIG
    <144> OP_CHECKSEQUENCEVERIFY OP_DROP
    → User alone after 1 day. Sweeps all funds to recovery address.
    → Last resort if agent + backend both fail

  Leaf 4: "Clawback" (spends the Leaf 2 timelocked output)
    <user_vault_key> OP_CHECKSIG
    → During the Leaf 2 delay window, user can redirect funds
      back to vault. Cancels a pending large payment.
```

**CTV Template Construction (at vault creation time):**

```python
# Pseudocode for constructing CTV-locked outputs

def create_vault_utxo(amount, vault_script, agent_key, user_key):
    # Pre-compute a set of spending templates for common amounts
    templates = {}
    for spend_amount in [1000, 5000, 10000, 50000]:  # sats
        change = amount - spend_amount - estimated_fee
        if change > dust_threshold:
            tx = Transaction(
                outputs=[
                    Output(spend_amount, "anyone"),   # payment (destination filled at spend time)
                    Output(change, vault_script),      # recursive vault
                ],
                locktime=0,
                version=2,
            )
            templates[spend_amount] = sha256(serialize_ctv(tx))
    return templates
```

**Limitation and workaround:** CTV commits to exact outputs. We can't have arbitrary amounts. For the POC, pre-compute templates for a small set of amounts (1k, 5k, 10k, 50k sats). For production, use CTV+CSFS where CSFS allows dynamic amount authorization.

### 3. Lightning Layer (L2)

**Node Setup (our backend, not the user):**

```bash
# 1. Start Bitcoin Inquisition node
bitcoind -signet -server -rpcuser=aegis -rpcpassword=<pw>

# 2. Start LND connected to Inquisition signet
lnd --bitcoin.signet \
    --bitcoin.node=bitcoind \
    --bitcoind.rpcuser=aegis \
    --bitcoind.rpcpass=<pw>

# 3. Start litd wrapping LND
litd --uipassword=<pw> \
     --lnd-mode=integrated \
     --network=signet
```

**User Account Provisioning (on wallet creation):**

```bash
# Create account with budget (e.g., 100,000 sats = ~$10)
litcli accounts create 100000 \
  --save_to /tmp/user_<id>.macaroon \
  --expiration_date 2026-12-31

# The macaroon contains:
# - lnd-custom account <account_id>
# - Permissions: offchain:read, offchain:write, invoices:read, invoices:write, info:read
# - Virtual balance: 100,000 sats (hard ceiling)
```

**Agent Account Provisioning (sub-account of user):**

```bash
# Create agent account with daily budget
litcli accounts create 50000 \
  --save_to /tmp/agent_<id>.macaroon

# Additionally constrain the macaroon:
lncli constrainmacaroon \
  --custom_caveat_name "role" \
  --custom_caveat_condition "agent" \
  /tmp/agent_<id>.macaroon \
  /tmp/agent_<id>_final.macaroon

# Agent macaroon permissions:
# ✓ offchain:write (can pay Lightning invoices)
# ✓ invoices:write (can create invoices to receive)
# ✓ invoices:read (can check invoice status)
# ✓ offchain:read (can see own payment history)
# ✗ onchain:* (cannot touch on-chain funds)
# ✗ peers:* (cannot modify node topology)
# ✗ macaroon:* (cannot bake new tokens)
```

**Enforcement:**

```
When agent makes a payment:
  1. Agent calls lnd.SendPayment(invoice) with its macaroon
  2. LND's RPC middleware intercepts the call
  3. Checks: agent account virtual balance >= payment amount + routing fees?
     YES → payment proceeds, balance deducted
     NO  → RPC returns error "insufficient balance"
  4. Agent sees: on-chain balance = 0 (always)
  5. Agent sees: channel list = empty (always)
  6. Agent sees: only its own payments/invoices
```

**Budget Top-Up Flow:**

```
1. Agent's balance < threshold → agent calls our API: POST /agent/topup-request
2. API server sends push notification to user's phone
3. User sees: "Assistant needs $5 more for subscriptions. Approve?"
4. User taps "Approve" → Face ID → passkey authenticates
5. API server: litcli accounts update <agent_id> --new_balance <current + topup>
6. Agent resumes operating
```

### 4. Agent Runtime

**Agent Architecture:**

```
Agent Process (Node.js):
  - LND gRPC client authenticated with scoped macaroon
  - Task scheduler (cron-like) for recurring payments
  - Invoice parser (BOLT11 / LNURL / L402)
  - Budget tracker (reads own account balance via LND)
  - Activity logger (tags each payment with purpose)
  - Top-up requester (calls API when balance low)

Agent Capabilities (L2 only):
  - Pay a Lightning invoice (within budget)
  - Create an invoice (for receiving)
  - Check payment status
  - Request budget increase (requires user biometric approval)

Agent CANNOT:
  - Spend more than its macaroon-enforced budget
  - Access on-chain funds or the CTV vault
  - See the LND node's real balance or channels
  - Bake new macaroons or escalate permissions
  - Operate after macaroon expiration
```

**Hierarchical Agent Delegation (stretch goal):**

```
Coordinator Agent (50k sats budget):
  │
  ├─ Attenuates macaroon → Research Sub-Agent (10k sats)
  │   Job: pay L402 APIs for price data
  │
  ├─ Attenuates macaroon → DCA Sub-Agent (30k sats)
  │   Job: execute dollar-cost-averaging buys
  │
  └─ Keeps 10k sats as reserve
```

### 5. Nunchuk Integration (Fallback if CTV Blocked)

If Bitcoin Inquisition / CTV setup hits blockers, fall back to Nunchuk's platform key for L1 policy enforcement on testnet:

```bash
# Create 2-of-3 wallet: user key + agent key + platform key
nunchuk sandbox create --name "Aegis Vault" --m 2 --n 3

# Add user's passkey-derived key (slot 0)
nunchuk sandbox add-key <sandbox-id> --slot 0 --fingerprint <user_xfp>

# Add agent key (slot 1)
nunchuk sandbox add-key <sandbox-id> --slot 1 --fingerprint <agent_xfp>

# Enable platform key (slot 2) with spending policy
nunchuk sandbox platform-key enable <sandbox-id>
nunchuk sandbox platform-key set-policy <sandbox-id> \
  --auto-broadcast \
  --limit-amount 10 --limit-currency USD --limit-interval DAILY

# Finalize
nunchuk sandbox finalize <sandbox-id>
```

This gives you the same tiered authority model without CTV:
- Agent + platform can spend ≤ $10/day (platform auto-co-signs)
- Agent + user can spend any amount (user passkey signs)
- User + platform can sweep funds (revoke agent)

---

## Hackathon POC Scope

### Must Have (Demo Day)

1. **Passkey wallet creation** — user creates wallet with biometric (WebAuthn PRF), no seed phrase
2. **CTV vault (L1 self-custody)** — on-chain vault on Inquisition signet with Taproot script tree: agent-only path (small, CTV-enforced), user+agent path (large), user-only recovery (timelock). Tx signed client-side in browser — server never holds vault keys.
3. **Vault deposit + balance** — receive signet BTC to vault address, display L1 balance
4. **Fund Lightning from vault** — user approves (biometric) moving funds from L1 vault to L2 Lightning channel
5. **Agent with budget (L2 custodial)** — AI agent makes autonomous Lightning payment within macaroon-enforced budget
6. **Agent budget enforcement** — agent tries to overspend, gets denied by LND middleware
7. **User approval for large L2 payment** — websocket notification, biometric approval in browser
8. **Unified balance display** — single balance (L1 savings + L2 spending) in USD, with breakdown available
9. **Vault clawback demo** — initiate large withdrawal, show timelock window, demonstrate user cancelling it

### Nice to Have

10. **CSFS dynamic amounts** — use OP_CHECKSIGFROMSTACK for flexible spending amounts instead of pre-committed CTV templates
11. **Agent delegation** — coordinator agent spawns sub-agents with attenuated macaroons
12. **Mobile app** — React Native + Expo version for phone demo
13. **BIP 89 blind signing** — Nunchuk platform key co-signs without seeing transaction details
14. **Silent Payments** — static receive address with per-payment unique on-chain addresses

### Out of Scope (Future)

- NFC tap-to-pay (requires mobile + NFC entitlement)
- Production LND node management
- Real mainnet funds
- App Store / Play Store submission
- Multi-user node architecture
- Full miniscript policy compiler

---

## File Structure

```
aegis/
├── CLAUDE.md                    # Instructions for Claude Code (keep existing + extend)
├── PROJECT_SPEC.md              # This file
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── server.js            # Express API server + WebSocket
│   │   ├── routes/
│   │   │   ├── auth.js          # WebAuthn registration + login
│   │   │   ├── wallet.js        # Balance, send/receive, history
│   │   │   ├── vault.js         # CTV vault: deposit, withdraw, clawback, fund-ln
│   │   │   └── agent.js         # Agent account: create, topup, pause, status
│   │   ├── services/
│   │   │   ├── lnd.js           # LND gRPC client wrapper
│   │   │   ├── litd.js          # litd account management
│   │   │   ├── bitcoin.js       # Bitcoin Inquisition RPC client
│   │   │   ├── ctv.js           # CTV + CSFS transaction construction
│   │   │   ├── vault.js         # Vault script builder (Taproot tree)
│   │   │   ├── macaroon.js      # Macaroon baking + attenuation
│   │   │   └── passkey.js       # WebAuthn server-side verification
│   │   ├── agent/
│   │   │   ├── runtime.js       # Agent main loop
│   │   │   ├── scheduler.js     # Recurring payment scheduler
│   │   │   ├── budget.js        # Budget tracking + top-up requests
│   │   │   └── tasks.js         # Agent task definitions
│   │   ├── ws/
│   │   │   └── notifications.js # WebSocket server for live updates
│   │   └── db/
│   │       ├── schema.sql       # User accounts, agent configs, vault UTXOs, tx history
│   │       └── index.js         # Database access layer
│   └── scripts/
│       ├── setup-lnd.sh         # LND + litd setup script
│       ├── setup-inquisition.sh # Bitcoin Inquisition node setup
│       └── fund-wallet.sh       # Get signet coins from faucet
├── web/                          # Next.js web app (primary frontend)
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.jsx       # Root layout
│   │   │   ├── page.jsx         # Landing / onboarding
│   │   │   ├── dashboard/
│   │   │   │   └── page.jsx     # Main wallet dashboard (balance, history, agent)
│   │   │   ├── send/
│   │   │   │   └── page.jsx     # Send payment flow
│   │   │   ├── receive/
│   │   │   │   └── page.jsx     # Receive (vault address + LN invoice)
│   │   │   ├── vault/
│   │   │   │   └── page.jsx     # Vault management (deposit, withdraw, clawback)
│   │   │   ├── agent/
│   │   │   │   └── page.jsx     # Agent dashboard + settings
│   │   │   └── settings/
│   │   │       └── page.jsx     # Wallet settings
│   │   ├── lib/
│   │   │   ├── passkey.js       # WebAuthn PRF key derivation (client-side)
│   │   │   ├── bitcoin.js       # bitcoinjs-lib: key derivation, tx signing (client-side)
│   │   │   ├── vault-signer.js  # Signs CTV vault txs in browser (NEVER sends keys to server)
│   │   │   ├── api.js           # Backend REST API client
│   │   │   └── ws.js            # WebSocket client for live updates
│   │   └── components/
│   │       ├── Balance.jsx      # Unified L1+L2 balance display
│   │       ├── TxList.jsx       # Transaction history (agent-tagged)
│   │       ├── AgentBudget.jsx  # Agent budget progress bar
│   │       ├── ApprovalModal.jsx # Biometric approval for large payments
│   │       ├── VaultStatus.jsx  # Vault balance + pending withdrawals
│   │       └── ClawbackTimer.jsx # Countdown for clawback window
│   └── public/
└── docs/
    ├── PITCH_DECK.md            # Hackathon presentation notes
    └── DEMO_SCRIPT.md           # Step-by-step demo walkthrough
```

---

## Setup Instructions (for Claude Code)

### Prerequisites

```bash
# 1. Node.js 22+
nvm install 22 && nvm use 22

# 2. Bitcoin Inquisition (for CTV support on signet)
# Download from: https://github.com/bitcoin-inquisition/bitcoin/releases
# Extract and add to PATH

# 3. LND
# Download from: https://github.com/lightningnetwork/lnd/releases
# v0.18+ recommended

# 4. litd (Lightning Terminal)
# Download from: https://github.com/lightninglabs/lightning-terminal/releases

# 5. Nunchuk CLI (already installed)
nunchuk auth status  # verify authenticated
```

### Step-by-Step Backend Setup

```bash
# 1. Start Bitcoin Inquisition signet node
bitcoind -signet \
  -server \
  -rpcuser=aegis \
  -rpcpassword=aegis123 \
  -txindex=1 \
  -daemon

# Wait for sync (signet is small, ~10 min)
bitcoin-cli -signet getblockchaininfo

# 2. Get signet coins
# Use faucet or contrib/signet/getcoins.sh

# 3. Start LND
lnd --bitcoin.signet \
    --bitcoin.node=bitcoind \
    --bitcoind.rpchost=localhost \
    --bitcoind.rpcuser=aegis \
    --bitcoind.rpcpass=aegis123 \
    --debuglevel=info

# 4. Create LND wallet
lncli create  # follow prompts

# 5. Start litd (wraps LND for account system)
litd --uipassword=aegis123 \
     --lnd-mode=integrated \
     --network=signet

# 6. Open a channel (need signet coins first)
lncli openchannel --node_key <peer_pubkey> --local_amt 1000000

# 7. Start the API server
cd aegis/backend
npm install
npm run dev
```

### Environment Variables

```bash
# backend/.env
LND_HOST=localhost:10009
LND_CERT_PATH=~/.lnd/tls.cert
LND_MACAROON_PATH=~/.lnd/data/chain/bitcoin/signet/admin.macaroon
BITCOIN_RPC_HOST=localhost
BITCOIN_RPC_PORT=38332
BITCOIN_RPC_USER=aegis
BITCOIN_RPC_PASS=aegis123
LITD_HOST=localhost:8443
PORT=3000
```

---

## Demo Script

### Scene 1: "No seed phrase" (30 sec)

> "Watch me create a Bitcoin wallet."

- Open web app in Chrome → tap "Create Wallet" → biometric prompt (Touch ID / Face ID) → wallet created
- "That's it. No seed phrase. No 24 words. My keys live in my device's secure enclave, derived from a passkey. The vault signing key was just generated — it never leaves this browser."

### Scene 2: "Self-custodial vault" (45 sec)

> "I'm going to deposit Bitcoin into my vault."

- Show vault address (Taproot) → send signet coins from faucet
- Balance appears: "Savings: $50.00"
- "This is a CTV covenant vault running on Bitcoin Inquisition signet. The spending rules are baked into the Bitcoin script itself. My server cannot touch these funds. Only my passkey can move them."
- Show the Taproot script tree on screen: "Here are the spending paths — agent small spend, user-approved large spend, and emergency recovery with a timelock."

### Scene 3: "Fund the spending account" (30 sec)

> "Now I'll move some funds to my spending account for the agent."

- Tap "Fund Spending" → biometric prompt → constructs on-chain tx
- "I just signed a transaction in the browser moving $20 from my vault to a Lightning channel. The server never saw my private key. My savings stay self-custodial. My spending balance is now on Lightning — that part is custodial, on our node."
- Balance updates: "Savings: $30 | Spending: $20"

### Scene 4: "The agent gets a budget" (30 sec)

> "I'm going to give my AI assistant a daily budget of $10."

- Show agent dashboard → set daily limit to $10 → agent starts
- "The agent now has a Lightning macaroon — a cryptographic token scoped to a virtual account with a hard spending ceiling. The Lightning node's RPC middleware enforces it. No trust required."

### Scene 5: "Agent pays autonomously" (30 sec)

> "Watch the agent pay a Lightning invoice."

- Trigger agent to pay an invoice (e.g., simulated subscription)
- Show payment appearing live in activity log: "Podcast subscription — $4.99 (auto — assistant)"
- Show budget bar decreasing: "$5.01 remaining"

### Scene 6: "Agent tries to overspend" (15 sec)

> "Now watch what happens when it tries to spend more than its budget."

- Trigger agent to pay invoice exceeding remaining budget
- Show denial in real-time: "Payment denied — insufficient budget"
- "The agent literally cannot construct a valid payment. The Lightning node itself rejects it at the RPC layer."

### Scene 7: "Large payment needs my biometric" (30 sec)

> "What about a payment larger than the agent's limit?"

- Agent proposes large payment → live websocket notification appears in browser
- User sees: "Assistant wants to send $15. This exceeds the daily limit. Approve?"
- Biometric prompt → approve → payment goes through
- "For anything above the limit, the human has to approve with biometrics. The passkey bridges both layers."

### Scene 8: "The vault clawback" (45 sec)

> "Here's the real power — what if something goes wrong?"

- Initiate a large vault withdrawal (user + agent, Leaf 2)
- Show the pending withdrawal with countdown: "Confirming in 54 minutes"
- "Large on-chain withdrawals have a safety delay, enforced by Bitcoin consensus — not by our server. During this window, I can cancel."
- Tap "Cancel" → clawback transaction fires → funds return to vault
- "I just cancelled a pending withdrawal. Even if someone tricked me or the agent was compromised, I have a window to claw it back. Bitcoin script enforces this. No server can override it."

### Scene 9: "The big picture" (30 sec)

> "Here's what we built..."

- Show architecture diagram on screen
- "Two layers. Layer 1 is self-custodial — a CTV vault where Bitcoin consensus enforces the spending rules. My server has zero access. Layer 2 is custodial Lightning — fast payments, agent operates here with macaroon-enforced budgets. My passkey bridges both — it derives my vault key and authenticates to Lightning. No seed phrase. The agent has a budget and a job. I have a passkey and veto power. For savings, Bitcoin enforces the rules. For spending, cryptographic tokens enforce the limits."

---

## Key References

- Passkey PRF: https://github.com/breez/passkey-login/blob/main/spec.md
- LND Macaroons: https://docs.lightning.engineering/lightning-network-tools/lnd/macaroons
- LND Accounts: https://docs.lightning.engineering/lightning-network-tools/lightning-terminal/accounts
- L402 for Agents: https://lightning.engineering/posts/2026-03-11-L402-for-agents/
- Lightning Agent Tools: https://github.com/lightninglabs/lightning-agent-tools
- CTV (BIP 119): https://bitcoinops.org/en/topics/op_checktemplateverify/
- CSFS: https://bitcoinops.org/en/topics/op_checksigfromstack/
- CTV+CSFS Toolkit: https://hackmd.io/@AbdelStark/bitcoin-covenant-toolkit-ctv-csfs
- Bitcoin Inquisition: https://github.com/bitcoin-inquisition/bitcoin/releases
- BIP 89 Chain Code Delegation: https://github.com/bitcoin/bips/pull/2004
- Nunchuk Agent Skills: https://github.com/nunchuk-io/agent-skills
- Nunchuk CLI: https://github.com/nunchuk-io/nunchuk-cli
- Nunchuk Miniscript: https://nunchuk.io/blog/miniscript101
- Silent Payments (BIP 352): https://bitcoinops.org/en/topics/silent-payments/
- MuSig2 (BIP 327): https://bitcoinops.org/en/topics/musig/
- Apple Core NFC: https://developer.apple.com/documentation/corenfc
- WebAuthn PRF: https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/
- BitGo MuSig2 Implementation: https://bitcoinops.org/en/bitgo-musig2/
