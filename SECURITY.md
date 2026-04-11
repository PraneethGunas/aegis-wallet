# Security Policy

Aegis is a Bitcoin wallet. Security is foundational, not a feature.

---

## Security Model

### What the Server Can Access

| Data | Server Access |
|------|--------------|
| Passkey public key + credential ID | Yes — used for WebAuthn verification and user identity |
| Funding wallet signing key (private) | **No** — derived client-side via passkey PRF, never transmitted |
| PRF entropy / mnemonic | **No** — exists only in browser memory during signing |
| L2 Lightning balance | Yes — server runs the LND node (custodial layer) |
| Agent macaroon | Yes — server bakes and stores scoped macaroons |
| L1 funding wallet UTXOs | Yes (read-only) — server monitors the blockchain |
| L1 funding wallet spending | **No** — requires client-side signature with passkey-derived key |

### Passkey Roles

| Layer | Passkey Role | Security Implication |
|-------|-------------|---------------------|
| L1 (Funding) | **Key + Signer** | Passkey derives the private key AND signs on-chain txs. Server cannot spend L1 funds. |
| L2 (Spending) | **Auth only** | Passkey authenticates to backend. LND holds Lightning signing keys. Server is trusted with L2. |

### Identity Model

The passkey credential ID IS the user identity. There is no separate registration or login flow. Wallet creation stores the credential ID and public key — that IS the user record. Subsequent requests are authenticated via WebAuthn assertion, with optional short-lived tokens for high-frequency reads.

### What the Agent Can Access

| Capability | Agent Access |
|------------|-------------|
| Pay Lightning invoices (within budget) | Yes |
| Create Lightning invoices | Yes |
| View own payment history | Yes |
| Access on-chain funds or funding wallet | **No** |
| See node balance, channels, or peers | **No** |
| Bake or attenuate macaroons | **No** |
| Operate after macaroon is frozen | **No** |

### Key Derivation

All keys are derived client-side from WebAuthn PRF output:

```
PRF(passkey, "aegis-wallet-v1") → 32 bytes
  → BIP39 mnemonic → BIP32 master
  → funding_key:  m/86h/1h/0h/0/0  (signs L1 txs)
  → auth_key:     m/84h/1h/0h/0/0  (L2 auth only)
```

Key material exists in browser memory only during active signing operations, then is discarded. The mnemonic is never displayed, stored, or transmitted.

### Budget Enforcement (L2)

Agent spending limits are enforced by LND's RPC middleware at the account ledger level:

- litd creates a virtual balance for each agent account
- Every RPC call bearing the agent's macaroon is intercepted by middleware
- Middleware checks `account.balance >= payment + estimated_fees` before routing
- If insufficient, payment is rejected — never even attempts to route
- Enforcement is at the LND layer, not in our application code

---

## Reporting a Vulnerability

If you discover a security vulnerability in Aegis, **please report it responsibly**.

### Do

- Email security concerns to the maintainers (see contact below)
- Include a clear description of the vulnerability and steps to reproduce
- Allow reasonable time for a fix before public disclosure
- Scope your testing to testnet — never test against mainnet funds

### Don't

- Open a public GitHub issue for security vulnerabilities
- Exploit the vulnerability against other users
- Access, modify, or delete data that doesn't belong to you

### Contact

Report vulnerabilities via email: **praneethgunasekaran@gmail.com**

Use the subject line: `[AEGIS SECURITY]` followed by a brief description.

We aim to acknowledge reports within 48 hours and provide a fix timeline within 7 days.

---

## Scope

The following are in scope for security reports:

- Key derivation and signing logic (`web/src/lib/passkey.js`, `web/src/lib/bitcoin.js`)
- Macaroon baking and permission scoping (`backend/src/services/macaroon.js`)
- MCP server tool boundaries (`backend/src/mcp/`)
- WebAuthn assertion verification (`backend/src/services/passkey.js`)
- API authorization (`backend/src/routes/`)
- Any path where private key material could be leaked to the server

The following are **out of scope**:

- Vulnerabilities in upstream dependencies (LND, litd) — report these to their respective projects
- Denial-of-service against the testnet node
- Social engineering attacks
- Issues that require physical access to the user's device

---

## Supported Versions

| Version | Supported |
|---------|-----------|
| Development (main branch) | Yes |
| Tagged releases | Yes |
| Forks | No — report to the fork maintainer |

---

## Security Checklist for Contributors

Before submitting a PR that touches security-sensitive code:

- [ ] Private keys, mnemonics, and PRF entropy are never logged, stored, or sent to the server
- [ ] On-chain transactions are signed client-side only
- [ ] MCP server tools cannot access L1 keys or funding wallet UTXOs
- [ ] Macaroon permissions are scoped to the minimum required
- [ ] No secrets in committed files (`.env`, `*.macaroon`, `tls.cert`)
- [ ] Input validation at API boundaries (route handlers)
- [ ] No new dependencies with known CVEs
