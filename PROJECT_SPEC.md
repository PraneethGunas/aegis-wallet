# Aegis — The Agentic Bitcoin Wallet

## One-Line Pitch

A seedless Bitcoin wallet where Claude operates as your AI financial agent — spending within cryptographically enforced Lightning budgets, hitting real budget walls, and escalating to your biometric approval when it needs more. No custom agent code. Claude is the agent.

---

## Elevator Pitch (30 seconds)

We built a Bitcoin wallet where you never see a private key — and Claude is your financial agent. Your keys live in your device's secure enclave, derived from a passkey. Face ID is your signature. You pair Claude to your wallet via an MCP server, and Claude gets real spending tools backed by a Lightning macaroon with a hard budget ceiling. Claude decides what to pay, hits real cryptographic walls when it overspends, and escalates to your biometric approval when it needs more. No custom agent runtime. No scripted bot. Claude is the agent. The macaroon is the leash.

---

## The Problem

1. **Seed phrases are hostile UX.** 70%+ of normal users cannot securely manage a 24-word recovery phrase. This is the single biggest barrier to Bitcoin self-custody adoption.
2. **AI agents need to transact, but giving them keys is terrifying.** Claude, GPT, and other LLMs can reason about payments — but there's no standard way to give them bounded spending authority over Bitcoin. It's either full access or nothing.
3. **No standard for agent budget enforcement.** There's no protocol-level mechanism for giving an AI a spending budget that it literally cannot exceed — where the enforcement is cryptographic, not a trust assumption.

## The Solution

A two-layer wallet with clear separation of concerns:

- **L1 (Funding — Self-Custody):** Standard Taproot address on mainnet. Passkey derives the private key AND signs on-chain transactions — the passkey IS the key. No server, no agent, no co-signer. User signs in the browser to fund Lightning or send to any address.
- **L2 (Spending — Custodial):** LND + litd Lightning node operated by us (or by the user if they run their own node). The passkey authenticates the user to our backend (for creating agents, approving top-ups, withdrawing) but does NOT sign Lightning transactions — LND holds those keys. Claude gets a macaroon-scoped account with a hard budget ceiling. Payments are instant. Budget is enforced by LND's RPC middleware. Exposure is limited to what the user explicitly funds from L1.
- **Passkey (Control Plane):** WebAuthn PRF extension derives keys from the device's secure enclave. No seed phrase. Recovery = passkey syncs to new device, wallet regenerates. On L1, the passkey derives the funding key and signs transactions. On L2, the passkey authenticates to our backend — it does not sign Lightning transactions.

**Custody Model:**

```
┌─────────────────────────────────────────────────┐
│  L1: SELF-CUSTODY (passkey = key + signer)      │
│  Standard Taproot address. Passkey derives key  │
│  AND signs txs in browser. Funding wallet.      │
│  We have ZERO access.                           │
├─────────────────────────────────────────────────┤
│  User funds L2 (requires biometric)             │
│  ↓ On-chain tx to LND's on-chain address        │
├─────────────────────────────────────────────────┤
│  L2: CUSTODIAL (our node, macaroon-enforced)    │
│  LND holds signing keys. Passkey = auth only.   │
│  Claude operates here via MCP.                   │
│  Budget enforced by LND RPC middleware.          │
│  User can withdraw back to L1 at any time.      │
│                                                  │
│  Self-custodial option: user runs own LND node. │
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
│  │                    │  │  - Approval modals (budget top-up) │ │
│  │  Derives:          │  │  - Settings                        │ │
│  │  - funding key(L1) │  │  L1: passkey = key + signer         │ │
│  │  - auth key (L2)   │  │  L2: passkey = auth only            │ │
│  │                    │  │  - REST API (all operations)       │ │
│  └──────────────────┘  │  - WebSocket (live updates)         │ │
│                          └─────────────────────────────────────┘ │
│                                                                  │
│  KEY POINT: Funding key (L1) derived client-side via PRF.       │
│  Passkey = key + signer on L1. On-chain tx signed IN BROWSER.  │
│  L2 auth key authenticates to our backend — passkey = auth only.│
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
│  │  POST /wallet/create      → stores passkey credential + pubkey ││
│  │  POST /wallet/receive    → generates LN invoice or address    ││
│  │  POST /wallet/send       → sends on-chain tx (user signs)    ││
│  │  POST /agent/create      → creates litd account + macaroon    ││
│  │  POST /agent/pair        → generates MCP pairing config + QR  ││
│  │  POST /agent/topup       → increases agent budget (assertion) ││
│  │  POST /agent/pause       → freezes agent macaroon             ││
│  │  GET  /wallet/balance    → combined L1+L2 balance             ││
│  │  GET  /wallet/history    → unified transaction history        ││
│  │  GET  /agent/status      → agent budget + activity            ││
│  │  POST /ln/fund           → construct unsigned tx to fund LN   ││
│  │                            (client signs, sends back)          ││
│  │  POST /ln/withdraw       → withdraw LN → on-chain address    ││
│  └────────────┬──────────────────────────────────────────────────┘│
│               │                                                    │
│  ┌────────────▼──────────────────────────────────────────────────┐│
│  │  LND + litd (CUSTODIAL L2)                                    ││
│  │                                                                ││
│  │  - Lightning payments (instant, off-chain)                    ││
│  │  - litd Account system (virtual balance per user/agent)       ││
│  │  - Macaroon bakery (scoped credentials)                       ││
│  │  - RPC middleware (pre-payment balance check on EVERY call)   ││
│  │  - Channel management                                         ││
│  │                                                                ││
│  │  We control this node. User trusts us with spending balance.  ││
│  │  Self-custodial option: user runs own LND, points MCP there.  ││
│  │                                                                ││
│  │  Accounts:                                                    ││
│  │  - User account (full L2 balance, user's macaroon)            ││
│  │  - Agent account (scoped budget, Claude's macaroon via MCP)   ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                    Aegis MCP Server                           │ │
│  │                                                               │ │
│  │  Exposes wallet tools to Claude (or any MCP-compatible AI):  │ │
│  │  - pay_invoice(bolt11)     — pay LN invoice (within budget)  │ │
│  │  - create_invoice(amt,memo)— generate invoice to receive     │ │
│  │  - get_balance()           — read agent's budget balance     │ │
│  │  - get_budget_status()     — remaining budget + spend history│ │
│  │  - request_topup(amt,reason) — ask user for more budget      │ │
│  │  - list_payments()         — agent's own payment history     │ │
│  │                                                               │ │
│  │  Behind the scenes:                                           │ │
│  │  - Holds scoped macaroon (never exposed to Claude)           │ │
│  │  - Mediates ALL LND calls through macaroon                   │ │
│  │  - Logs every tool call with Claude's stated purpose          │ │
│  │  - Budget denial → returns error, triggers WS to user        │ │
│  │  - Top-up request → WS notification → user biometric approval│ │
│  │                                                               │ │
│  │  Claude CANNOT:                                               │ │
│  │  - Access L1 funding wallet (no on-chain tools exposed)      │ │
│  │  - See node topology, channels, or real balance               │ │
│  │  - Bake new macaroons or escalate permissions                │ │
│  │  - Bypass budget — LND RPC middleware enforces it             │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                    Agent Pairing                               │ │
│  │                                                               │ │
│  │  1. User creates agent account in web app (litd account)     │ │
│  │  2. Web app shows QR code: MCP server URI + auth token       │ │
│  │  3. User scans QR / pastes config into Claude Code/Cowork    │ │
│  │  4. Claude now has wallet tools — macaroon stays server-side │ │
│  │  5. Revoke: tap "Pause Agent" → macaroon frozen instantly    │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘

```

**Claude as Agent (not a custom runtime):**

```
┌──────────────────────┐         ┌──────────────────────────────┐
│  Claude               │  MCP   │  Aegis Backend                │
│  (Code / Cowork /     │◄──────►│                                │
│   Chat + MCP)         │ stdio  │  MCP Server                    │
│                        │  or    │  ├─ pay_invoice → litd → LND  │
│  User says:            │ SSE    │  ├─ get_balance → litd account │
│  "Pay for podcast"    │        │  ├─ request_topup → WS → user │
│  Claude calls:         │        │  └─ macaroon (never leaves)   │
│  pay_invoice(bolt11)  │        │                                │
└──────────────────────┘         └──────────────────────────────┘
```

---

## Technology Stack

### Backend

| Component | Technology | Purpose |
|---|---|---|
| API Server | Node.js + Express | REST API + WebSocket for web app |
| MCP Server | Node.js (MCP SDK) | Exposes wallet tools to Claude via MCP protocol |
| Lightning Node | LND v0.18+ | Lightning payments, channels |
| Lightning Terminal | litd (wrapping LND) | Account system, macaroon management, RPC middleware |
| AI Agent | Claude (user's existing subscription) | No custom agent — Claude IS the agent via MCP |
| Database | SQLite or Postgres | User accounts, agent configs, tx history |

### Web App (Primary — Hackathon)

| Component | Technology | Purpose |
|---|---|---|
| Framework | Next.js (React) | Web application, SSR for initial load |
| Styling | Tailwind CSS | Fast, clean UI for demos |
| Passkey | @simplewebauthn/browser + PRF extension | Key derivation from device secure enclave |
| Biometrics | WebAuthn user verification (triggers Face ID / Touch ID / Windows Hello) | User approval for funding LN + budget top-ups |
| Backend Comms | REST API + WebSocket | API calls + live agent activity updates |
| Key Derivation | bitcoinjs-lib + bip39 + tiny-secp256k1 (in browser) | Funding key derived client-side from passkey |
| Tx Signing | bitcoinjs-lib (in browser) | On-chain transactions signed client-side, never on server |
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
| User runs own LND (self-custodial L2) | We run the node (custodial L2, simpler demo) |
| Custom agent runtime | Claude via MCP — no agent code to write |
| Production LND in cloud | LND on laptop connected to mainnet |
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
   funding_key    = master_key / 86h / 0h / 0h / 0 / 0   (mainnet, taproot — SIGNS L1 txs)
   auth_key       = master_key / 84h / 0h / 0h / 0 / 0   (mainnet, L2 auth only — no signing)
```

**At signing time (funding L2 from L1):**

```
1. Face ID prompt → passkey authentication
2. PRF(passkey, "aegis-wallet-v1") → same 32 bytes
3. Re-derive the funding key
4. Sign the on-chain transaction in the browser (passkey IS the signer)
5. Discard all key material from memory
```

**Recovery:**

```
1. New device → sign into Apple/Google account → passkey syncs
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

### 2. L1 Funding Wallet (On-Chain)

Simple Taproot address derived from the user's passkey. The passkey derives the private key AND signs all on-chain transactions — the passkey IS the key. No covenants, no multi-sig, no agent involvement.

```
Address type: P2TR (Taproot, BIP 86)
Key:          funding_key = master / 86h / 0h / 0h / 0 / 0
Network:      mainnet (bc1p... address format)

Operations:
  - Receive: backend returns the Taproot address
  - Fund L2: user signs tx in browser → sends to LND's on-chain address
  - Send to address: user signs tx in browser → standard payment
  - Balance: backend queries mainnet node for UTXO set
```

The funding wallet is deliberately simple. No agent. No server-side key. The user's passkey-derived key signs everything. If our server disappears, the user still has their passkey and can spend from any Bitcoin wallet.

### 3. L2 Spending (Lightning + Macaroon Budget Enforcement)

**Node Setup (our backend, not the user):**

```bash
# 1. Start LND connected to mainnet
lnd --bitcoin.mainnet \
    --bitcoin.node=bitcoind \
    --bitcoind.rpcuser=aegis \
    --bitcoind.rpcpass=<pw>

# 2. Start litd wrapping LND
litd --uipassword=<pw> \
     --lnd-mode=integrated \
     --network=mainnet
```

**How macaroon budget enforcement works:**

litd's account system creates a virtual balance ledger inside LND. Each account has a balance ceiling. Each account gets a macaroon (bearer token) cryptographically tied to that account.

```
When Claude calls pay_invoice via MCP:

  1. MCP server receives the call
  2. MCP server calls LND SendPaymentV2 with the agent's scoped macaroon
  3. LND's RPC middleware intercepts the call BEFORE routing
  4. Middleware looks up the macaroon → finds agent account
  5. Checks: account.balance >= invoice_amount + estimated_routing_fees?
     YES → LND routes the payment, deducts from virtual balance
     NO  → RPC returns error "insufficient balance"
           Payment never even attempts to route.
  6. MCP server returns result to Claude

The enforcement is at the LND RPC layer — not in our code.
Our MCP server is just a passthrough. Even if the MCP server
had a bug, LND itself would reject overspending.
```

**Account provisioning:**

```bash
# Create agent account with budget (e.g., 50,000 sats)
litcli accounts create 50000 \
  --save_to /tmp/agent_<id>.macaroon

# Agent macaroon permissions:
# ✓ offchain:write (can pay Lightning invoices)
# ✓ invoices:write (can create invoices to receive)
# ✓ invoices:read (can check invoice status)
# ✓ offchain:read (can see own payment history)
# ✗ onchain:* (cannot touch on-chain funds)
# ✗ peers:* (cannot modify node topology)
# ✗ macaroon:* (cannot bake new tokens)
```

**What the agent sees vs reality:**

```
Agent's view (via scoped macaroon):
  - Balance: 50,000 sats (virtual account balance)
  - Payments: only its own
  - Invoices: only its own
  - On-chain: nothing (zero, always)
  - Channels: nothing (empty, always)
  - Peers: nothing

Actual node state (invisible to agent):
  - Real channel balance: 10,000,000 sats
  - 15 open channels
  - 3 other user accounts
  - On-chain wallet with funding UTXOs
```

**Budget Top-Up Flow:**

```
1. Claude calls request_topup(amount, reason) via MCP
2. MCP server sends WebSocket notification to user's browser
3. User sees: "Claude needs $5 more for: API access. Approve?"
4. User taps "Approve" → biometric prompt → passkey authenticates
5. Backend: litcli accounts update <agent_id> --new_balance <current + topup>
6. MCP server notifies Claude: budget updated
7. Claude retries the payment
```

### 4. MCP Server + Claude as Agent

**Why MCP instead of a custom agent runtime:**

The original design had a Node.js agent process with a cron scheduler and hardcoded tasks. The problem: the "agent" never actually made decisions — it was a script. Boundary conditions (budget exceeded, large payment approval) never triggered organically because there was no intelligence.

With Claude as the agent, boundary conditions emerge from real AI reasoning. Claude decides what to pay, when, and why. When it hits the macaroon budget ceiling, the denial is real and Claude has to decide what to do — ask the user for a top-up, prioritize which payments matter, or explain why it needs more budget.

**MCP Server Architecture:**

```
The MCP server is a thin layer between Claude and LND/litd.
It holds the scoped macaroon and mediates every call.

MCP Server (Node.js, @modelcontextprotocol/sdk):
  7 tools exposed to Claude:
  ┌─────────────────────────────────────────────────────────┐
  │ pay_invoice(bolt11, purpose)                            │
  │   → Validates invoice, calls LND SendPaymentV2          │
  │   → Budget check by LND RPC middleware (macaroon)       │
  │   → Returns: {success, amount_sats, fee, balance_left,  │
  │              preimage}                                   │
  │   → On denial: returns error + triggers WS to user app  │
  │                                                          │
  │ create_invoice(amount_sats, memo)                       │
  │   → Creates LN invoice via litd account                  │
  │   → Returns: {bolt11, payment_hash}                      │
  │                                                          │
  │ get_balance()                                            │
  │   → Reads litd virtual account balance                   │
  │   → Returns: {balance_sats, balance_usd,                │
  │              auto_pay_threshold_sats}                    │
  │                                                          │
  │ get_budget_status()                                      │
  │   → Returns: {spent_today, remaining, recent_payments}   │
  │                                                          │
  │ request_approval(amount_sats, reason)                    │
  │   → For payments OVER the user's auto-pay threshold     │
  │   → Sends WebSocket notification to user's browser       │
  │   → User sees: "Approve $X for: [reason]?" + biometric  │
  │   → Returns: {approved, approval_id}                     │
  │   → If approved: Claude proceeds with pay_invoice()      │
  │                                                          │
  │ request_topup(amount_sats, reason)                       │
  │   → For increasing the overall budget ceiling            │
  │   → Sends WebSocket notification to user's browser       │
  │   → User sees: "Add $X to budget for: [reason]?"        │
  │   → Returns: {pending, approval_id}                      │
  │   → After approval: budget updated, Claude notified      │
  │                                                          │
  │ list_payments(limit)                                     │
  │   → Returns agent's payment history with purposes        │
  │   → Each entry tagged: auto-approved or manually-approved│
  └─────────────────────────────────────────────────────────┘

  NOT exposed to Claude (enforced by MCP server):
  - No on-chain tools (L1 funding wallet is invisible to Claude)
  - No macaroon access (held server-side only)
  - No node info (topology, channels, real balance)
  - No macaroon baking or permission escalation
```

**Agent Pairing Flow:**

```
1. User opens Aegis web app → navigates to Agent settings
2. Taps "Create Agent" → backend creates litd account + scoped macaroon
3. Web app generates pairing config:
   {
     "mcpServer": "https://aegis.example.com/mcp",
     "authToken": "aegis_agent_<random>",
     "budgetSats": 50000,
     "label": "Claude Agent"
   }
4. Displayed as:
   a) QR code (scan with phone camera → paste into Claude config)
   b) Copy-paste config block for Claude Code / Cowork
   c) One-click "Add to Claude" deep link (if supported)

5. User adds to Claude Code:
   claude mcp add aegis-wallet -- npx aegis-mcp-client \
     --server https://aegis.example.com/mcp \
     --token aegis_agent_<random>

6. Claude now has wallet tools. Macaroon never leaves the server.

7. To revoke: user taps "Pause Agent" → macaroon frozen server-side
   → Claude's next tool call returns "agent_paused" error
```

**How Claude uses the tools (example conversation):**

```
User: "Hey Claude, I want to subscribe to this podcast. Here's
       the Lightning address. Pay $4.99/month."

Claude:
  1. Calls get_balance() → {balance_sats: 50000, balance_usd: "$5.20"}
  2. Resolves LNURL → gets BOLT11 invoice for 48000 sats
  3. Calls pay_invoice(bolt11, "Podcast subscription - $4.99")
     → {success: true, balance_left: 2000}
  4. Tells user: "Paid $4.99 for the podcast. You have $0.21 left
     in your spending budget."

User: "Also pay for this API access — it's $8."

Claude:
  1. Calls get_balance() → {balance_sats: 2000, balance_usd: "$0.21"}
  2. Realizes budget is insufficient
  3. Calls request_topup(77000, "Need $8 for API access the user requested")
     → {pending: true, approval_id: "abc123"}
  4. Tells user: "Your spending budget is $0.21 — not enough for $8.
     I've sent an approval request to your wallet app."

  [User's browser shows: "Claude needs $8 more for: API access.
   Approve?" → Face ID → approved]

  5. Claude gets notification: budget updated
  6. Calls pay_invoice(bolt11, "API access - user requested")
     → {success: true}
```

**Hierarchical Agent Delegation (stretch goal):**

```
Claude (primary agent, 50k sats budget):
  │
  │  Claude can attenuate its own macaroon via MCP tool:
  │  create_sub_agent(budget_sats, label, permissions)
  │
  ├─ Sub-agent macaroon → Research tool (10k sats)
  │   Claude hands this to an MCP tool that auto-pays L402 APIs
  │
  ├─ Sub-agent macaroon → DCA service (30k sats)
  │   Scheduled service that buys on a recurring basis
  │
  └─ Keeps 10k sats as reserve for ad-hoc payments
```

---

## Hackathon POC Scope

### Must Have (Demo Day)

1. **Passkey wallet creation** — user creates wallet with biometric (WebAuthn PRF), no seed phrase
2. **Funding address (L1)** — Taproot (bc1p...) from passkey-derived key, receive mainnet BTC, display balance
3. **Fund Lightning from funding wallet** — user approves (biometric), passkey signs on-chain tx from L1 to LND's on-chain address. Signed in browser.
4. **MCP server with 7 wallet tools** — pay_invoice, get_balance, get_budget_status, request_approval, request_topup, create_invoice, list_payments. Holds scoped macaroon server-side, mediates all LND calls.
5. **Agent pairing flow** — user creates agent account, gets QR/config, pairs Claude via MCP. Macaroon never leaves server.
6. **Auto-pay threshold** — user-configurable per-payment limit. Claude auto-pays under threshold, requests approval over threshold.
7. **Claude makes autonomous payment** — Claude uses MCP tools to pay a Lightning invoice within budget + threshold. Live activity in web app. Transaction tagged as auto-approved.
8. **Payment approval** — Claude tries to pay over threshold → request_approval → biometric prompt → user approves/denies specific payment.
9. **Budget enforcement** — Claude tries to overspend budget → denied by LND middleware → Claude calls request_topup → biometric → budget extended.
10. **Unified balance display** — single balance (L1 funding + L2 spending) in USD, with breakdown available

### Demo Scenario: Domain Purchase via L402

User asks Claude: "Buy me coolproject.co"
1. Claude searches unhuman.domains API → domain available ($8)
2. Claude POSTs to register → gets HTTP 402 + real Lightning invoice (L402 protocol)
3. Claude calls get_balance() → checks invoice amount vs auto_pay_threshold
4. Over threshold → calls request_approval(amount, "coolproject.co registration")
5. User's browser shows: "Claude wants to pay $8 for coolproject.co. Approve?" → Face ID
6. Claude calls pay_invoice(bolt11) → real Lightning payment → gets preimage
7. Claude replays registration with `Authorization: L402 <macaroon>:<preimage>` → domain registered
8. User sees payment in activity feed, balance updated

unhuman.domains API reference: https://unhuman.domains (native L402, real Lightning invoices, .com/.io/.dev/.co/.ai TLDs)

### Nice to Have

- **Agent delegation** — Claude attenuates macaroon via MCP tool, creates sub-agent accounts
- **Mobile app** — React Native + Expo version for phone demo
- **Airgapped QR pairing** — transfer agent credentials via camera→screen QR only (no network)
- **Self-custodial L2** — user runs own LND node, points MCP server at it

### Out of Scope (Future)

- CTV/CSFS covenant vaults (when opcodes reach mainnet)
- NFC tap-to-pay (requires mobile + NFC entitlement)
- Custom agent runtime (Claude IS the agent — no bot code)
- Production LND node management
- Real mainnet funds
- App Store / Play Store submission
- Multi-user node architecture

---

## File Structure

```
aegis/
├── CLAUDE.md                    # Instructions for Claude Code
├── PROJECT_SPEC.md              # This file
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── server.js            # Express API server + WebSocket
│   │   ├── routes/
│   │   │   ├── wallet.js        # Create wallet, balance, send/receive, history
│   │   │   └── agent.js         # Agent account: create, pair, topup, pause, status
│   │   ├── services/
│   │   │   ├── lnd.js           # LND gRPC client wrapper
│   │   │   ├── litd.js          # litd account management
│   │   │   ├── macaroon.js      # Macaroon baking + attenuation
│   │   │   └── passkey.js       # WebAuthn assertion verification (passkey = identity)
│   │   ├── mcp/
│   │   │   ├── server.js        # MCP server entry point (stdio or SSE transport)
│   │   │   ├── tools.js         # Tool definitions: pay_invoice, get_balance, etc.
│   │   │   ├── auth.js          # Agent auth token validation + rate limiting
│   │   │   └── pairing.js       # QR code / config generation for Claude pairing
│   │   ├── ws/
│   │   │   └── notifications.js # WebSocket server for live updates
│   │   └── db/
│   │       ├── schema.sql       # User accounts, agent configs, tx history
│   │       └── index.js         # Database access layer
│   └── scripts/
│       ├── docker-compose.yml    # LND + litd Docker setup
│       └── fund-wallet.sh       # Fund LND wallet
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
│   │   │   │   └── page.jsx     # Receive (funding address + LN invoice)
│   │   │   ├── agent/
│   │   │   │   └── page.jsx     # Agent dashboard: pair Claude, budget, activity, pause
│   │   │   └── settings/
│   │   │       └── page.jsx     # Wallet settings
│   │   ├── lib/
│   │   │   ├── passkey.js       # WebAuthn PRF key derivation (client-side)
│   │   │   ├── bitcoin.js       # bitcoinjs-lib: key derivation, tx signing (client-side)
│   │   │   ├── api.js           # Backend REST API client
│   │   │   └── ws.js            # WebSocket client for live updates
│   │   └── components/
│   │       ├── Balance.jsx      # Unified L1+L2 balance display
│   │       ├── TxList.jsx       # Transaction history (agent-tagged)
│   │       ├── AgentBudget.jsx  # Agent budget progress bar
│   │       ├── ApprovalModal.jsx # Biometric approval for budget top-ups
│   │       └── PairingQR.jsx    # QR code for Claude pairing
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

# 2. Docker + Docker Compose (for LND + litd)
# LND and litd run in Docker containers on mainnet
```

### Step-by-Step Backend Setup

```bash
# 1. Start LND + litd via Docker
docker compose up -d

# 2. Fund the wallet
docker exec aegis-lnd lncli newaddress p2tr
# Send mainnet sats to this address

# 3. Open a channel (need mainnet sats first)
docker exec aegis-lnd lncli openchannel --node_key <peer_pubkey> --local_amt 1000000

# 6. Start the API server
cd aegis/backend
npm install
npm run dev
```

### Environment Variables

```bash
# backend/.env
LND_HOST=localhost:10009
LND_CERT_PATH=~/.lnd/tls.cert
LND_MACAROON_PATH=~/.lnd/data/chain/bitcoin/mainnet/admin.macaroon
LITD_HOST=localhost:8443
PORT=3001
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## Demo Script

### Scene 1: "No seed phrase" (30 sec)

> "Watch me create a Bitcoin wallet."

- Open web app in Chrome → tap "Create Wallet" → biometric prompt (Touch ID / Face ID) → wallet created
- "That's it. No seed phrase. No 24 words. My keys live in my device's secure enclave, derived from a passkey. My funding key was just derived from the passkey — it never leaves this browser."

### Scene 2: "Fund the wallet" (30 sec)

> "I'm going to receive some Bitcoin."

- Show funding address (Taproot) → send mainnet sats
- Balance appears: "Funding: $50.00"
- "This is a standard Taproot address derived from my passkey. The passkey IS the key — it derived the private key and will sign transactions. My server has zero access to these funds."

### Scene 3: "Move to spending" (30 sec)

> "Now I'll fund my spending account for the agent."

- Tap "Fund Spending" → enter $20 → biometric prompt → passkey signs on-chain tx in browser
- "I just signed a transaction moving $20 from my funding wallet to Lightning. The passkey derived the key and signed the tx — all in the browser. My spending balance is now on our Lightning node."
- Balance updates: "Funding: $30 | Spending: $20"

### Scene 4: "Pairing Claude" (45 sec)

> "Now here's where it gets interesting. I'm going to pair Claude as my financial agent."

- Open Agent dashboard → tap "Create Agent" → set daily budget to $10
- QR code appears on screen with MCP pairing config
- Switch to Claude Code terminal → `claude mcp add aegis-wallet ...` (or scan QR)
- "I just gave Claude a connection to my wallet — but not my keys. Claude gets tools: pay invoices, check balance, request more budget. Behind the scenes, there's a Lightning macaroon with a hard $10 spending ceiling. Claude never sees the macaroon. Our server mediates every call. The Lightning node enforces the budget at the RPC layer."
- Show agent dashboard: "Claude Agent — paired — $10.00 budget"

### Scene 5: "Claude pays autonomously" (45 sec)

> "Watch Claude make a real spending decision."

- In Claude chat: "Hey Claude, I want access to this Bitcoin price API. Here's the endpoint. It costs 5000 sats."
- Claude calls `get_balance()` → checks budget → calls `pay_invoice(bolt11, "Bitcoin price API access")`
- Payment appears live in web app activity log: "Bitcoin price API — $4.99 (Claude Agent)"
- Budget bar decreases in real-time: "$5.01 remaining"
- "Claude decided to pay. It used the pay_invoice tool. The Lightning node checked the macaroon, confirmed the budget, and routed the payment. Claude didn't hold any keys — it just had a tool and a budget."

### Scene 6: "Claude hits the wall" (30 sec)

> "Now watch what happens when Claude tries to spend more than its budget."

- In Claude chat: "Also buy access to this analytics API — it's $8."
- Claude calls `get_balance()` → sees $5.01 remaining → calls `pay_invoice(bolt11)` → **DENIED**
- Claude responds: "I can't pay $8 — my budget only has $5.01 left. I've sent a top-up request to your wallet."
- Claude calls `request_topup(77000, "User requested analytics API access - $8")`
- "Claude hit a real cryptographic wall. The Lightning node rejected the payment at the RPC layer. Claude can't hack around it — the macaroon IS the budget. So Claude did the smart thing: it asked me for more money."

### Scene 7: "Biometric approval" (30 sec)

> "Let's approve Claude's request."

- Web app shows live notification: "Claude needs $8 more for: Analytics API access. Approve?"
- Tap "Approve" → biometric prompt (Face ID / Touch ID) → budget updated
- Claude gets notified → retries payment → succeeds
- "Face ID approved the top-up. The macaroon budget was extended. Claude retried and the payment went through. The human stays in the loop for anything above the daily limit — enforced by cryptography, approved by biometrics."

### Scene 8: "The big picture" (30 sec)

> "Here's what we built..."

- Show architecture diagram on screen
- "Two layers. Your funding wallet is self-custodial — a Taproot address where the passkey IS the key. It derives and signs. Spending is on Lightning — Claude operates here with macaroon-enforced budgets via MCP. On L2, the passkey is just for auth — LND holds the Lightning keys. We didn't build a custom agent. Claude IS the agent. We built the tools and the walls. The macaroon is the leash. The passkey is the key on L1 and the lock on L2. No seed phrase. No custom bot. Just Claude, a budget, and cryptographic enforcement. Want full self-custody on both layers? Run your own Lightning node. The architecture doesn't change — just swap the node URL."

---

## Key References

- Passkey PRF: https://github.com/breez/passkey-login/blob/main/spec.md
- LND Macaroons: https://docs.lightning.engineering/lightning-network-tools/lnd/macaroons
- litd Accounts: https://docs.lightning.engineering/lightning-network-tools/lightning-terminal/accounts
- L402 for Agents: https://lightning.engineering/posts/2026-03-11-L402-for-agents/
- Lightning Agent Tools: https://github.com/lightninglabs/lightning-agent-tools
- MCP Protocol: https://modelcontextprotocol.io/
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- WebAuthn PRF: https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/
- Nunchuk Agent Skills: https://github.com/nunchuk-io/agent-skills
- Nunchuk CLI: https://github.com/nunchuk-io/nunchuk-cli
