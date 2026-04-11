# Security Policy

Aegis is a Bitcoin wallet. Security is foundational, not a feature.

---

## Security Model

### What the Server Can Access

| Data | Server Access |
|------|--------------|
| Passkey public key | Yes — used for WebAuthn verification |
| Vault signing key (private) | **No** — derived client-side, never transmitted |
| PRF entropy / mnemonic | **No** — exists only in browser memory during signing |
| L2 Lightning balance | Yes — server runs the LND node (custodial layer) |
| Agent macaroon | Yes — server bakes and stores scoped macaroons |
| L1 vault UTXOs | Yes (read-only) — server monitors the blockchain |
| L1 vault spending | **No** — requires client-side signature with passkey-derived key |

### What the Agent Can Access

| Capability | Agent Access |
|------------|-------------|
| Pay Lightning invoices (within budget) | Yes |
| Create Lightning invoices | Yes |
| View own payment history | Yes |
| Access on-chain funds or vault | **No** |
| See node balance, channels, or peers | **No** |
| Bake or attenuate macaroons | **No** |
| Operate after macaroon expiration | **No** |

### Key Derivation

All keys are derived client-side from WebAuthn PRF output:

```
PRF(passkey, "aegis-wallet-v1") → 32 bytes
  → BIP39 mnemonic → BIP32 master
  → vault_key:  m/86h/1h/0h/0/0
  → auth_key:   m/84h/1h/0h/0/0
```

Key material exists in browser memory only during active signing operations, then is discarded. The mnemonic is never displayed, stored, or transmitted.

### On-Chain Enforcement

The CTV vault's spending rules are enforced by Bitcoin Script at the consensus layer:

- **Small spends** — Agent signs + CTV template enforces exact output amounts
- **Large spends** — User + Agent sign + 6-block CSV delay before settlement
- **Clawback** — User can cancel pending large spends during the delay window
- **Emergency recovery** — User alone after 144 blocks (1 day)

No server, API, or middleware can override these rules. They are enforced by every Bitcoin node validating the transaction.

---

## Reporting a Vulnerability

If you discover a security vulnerability in Aegis, **please report it responsibly**.

### Do

- Email security concerns to the maintainers (see contact below)
- Include a clear description of the vulnerability and steps to reproduce
- Allow reasonable time for a fix before public disclosure
- Scope your testing to signet/testnet — never test against mainnet funds

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

- Key derivation and signing logic (`web/src/lib/passkey.js`, `web/src/lib/bitcoin.js`, `web/src/lib/vault-signer.js`)
- CTV vault script construction (`backend/src/services/ctv.js`, `backend/src/services/vault.js`)
- Macaroon baking and permission scoping (`backend/src/services/macaroon.js`)
- Agent runtime permission boundaries (`backend/src/agent/`)
- WebAuthn registration and authentication (`backend/src/services/passkey.js`, `backend/src/routes/auth.js`)
- API authentication and authorization (`backend/src/routes/`)
- Any path where private key material could be leaked to the server

The following are **out of scope**:

- Vulnerabilities in upstream dependencies (LND, litd, Bitcoin Inquisition) — report these to their respective projects
- Denial-of-service against the signet node
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
- [ ] Vault transactions are signed client-side only
- [ ] Agent code cannot access on-chain keys or vault UTXOs
- [ ] Macaroon permissions are scoped to the minimum required
- [ ] No secrets in committed files (`.env`, `*.macaroon`, `tls.cert`)
- [ ] Input validation at API boundaries (route handlers)
- [ ] No new dependencies with known CVEs
