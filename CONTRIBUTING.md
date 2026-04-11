# Contributing to Aegis

Aegis is an open-source project and we welcome contributions from the community. Whether you're fixing a bug, adding a feature, improving documentation, or just have an idea — we'd love to hear from you.

---

## Development Setup

### Prerequisites

- **Node.js 22+** — `nvm install 22 && nvm use 22`
- **LND v0.18+** — [Download](https://github.com/lightningnetwork/lnd/releases)
- **litd** — [Download](https://github.com/lightninglabs/lightning-terminal/releases) (Lightning Terminal, wraps LND)

You do **not** need a running Bitcoin/Lightning node to work on the frontend — the backend can run in mock mode for UI development.

### Clone and Install

```bash
git clone https://github.com/<org>/aegis.git
cd aegis

# Backend
cd backend
cp .env.example .env    # Edit with your local config
npm install

# Frontend
cd ../web
npm install
```

### Running Locally

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd web && npm run dev
```

The web app runs at `http://localhost:3000`, the API at `http://localhost:3001`.

---

## Project Structure

| Directory | What Lives Here |
|-----------|----------------|
| `backend/src/routes/` | Express API route handlers (wallet, agent, ln) |
| `backend/src/services/` | LND, litd, macaroon, passkey clients |
| `backend/src/mcp/` | MCP server, tool definitions, agent auth, pairing |
| `web/src/app/` | Next.js pages |
| `web/src/lib/` | Client-side crypto (passkey derivation, tx signing) |
| `web/src/components/` | React UI components |
| `docs/` | Pitch deck, demo script |

---

## How to Contribute

### 1. Find or Create an Issue

- Check [open issues](../../issues) for something that interests you
- If you have a new idea or found a bug, open an issue first to discuss it
- Issues labeled `good first issue` are a great starting point

### 2. Fork and Branch

```bash
git checkout -b feature/your-feature-name
```

Use descriptive branch names: `fix/agent-budget-overflow`, `feature/silent-payments`, `docs/setup-guide`.

### 3. Write Code

- Follow the existing code style in the file you're editing
- Keep PRs focused — one feature or fix per PR
- Add comments only where the logic isn't self-evident
- If you're touching security-sensitive code (key derivation, signing, macaroon handling), call it out in your PR description

### 4. Test Your Changes

```bash
# Backend
cd backend && npm test

# Frontend
cd web && npm test
```

If you're adding a new feature, include tests. If you're fixing a bug, add a test that reproduces it.

### 5. Submit a Pull Request

- Write a clear PR title and description
- Reference any related issues (`Fixes #123`)
- If your PR includes UI changes, include a screenshot or recording
- Expect a review within a few days — we may ask for changes

---

## Code Guidelines

### Security Rules (Non-Negotiable)

These are enforced in code review and CI. PRs that violate them will be rejected:

1. **Funding wallet keys (L1) stay client-side.** Never send private keys, mnemonics, PRF entropy, or xprv values to the server. All on-chain transactions are signed in the browser using the passkey-derived key.
2. **Never log secrets.** No private keys, macaroon hex, PRF output, or mnemonics in console.log, error messages, or analytics.
3. **Agent operates on L2 only via MCP.** The MCP server tools must not have access to L1 keys, funding wallet UTXOs, or the ability to bake new macaroons.
4. **No `.env` files, macaroon files, or credentials in commits.** The `.gitignore` covers these — don't override it.

### Code Style

- **JavaScript/TypeScript** — use the project's existing formatting (Prettier defaults)
- **Naming** — `camelCase` for variables/functions, `PascalCase` for components, `UPPER_SNAKE` for constants
- **Imports** — group by: Node builtins, external packages, internal modules
- **Error handling** — validate at system boundaries (user input, external APIs); trust internal code and framework guarantees

### Commit Messages

- Use imperative mood: "Add agent budget display" not "Added agent budget display"
- Keep the first line under 72 characters
- Reference issues when relevant: "Fix budget overflow when topup exceeds max (#45)"

---

## Areas Where Help Is Needed

Here are some areas where contributions would be especially valuable:

- **MCP server tools** — implementing and testing the 7 wallet tools Claude uses
- **WebAuthn PRF compatibility** — testing across browsers and platforms
- **Lightning integration testing** — simulated multi-node environments
- **Agent pairing flow** — QR code generation, config management, deep links
- **Frontend UI/UX** — dashboard design, responsive layout, accessibility
- **Documentation** — setup guides for different platforms, architecture deep-dives
- **Security review** — cryptographic code audit, threat modeling

---

## Reporting Bugs

Open an issue with:

1. What you expected to happen
2. What actually happened
3. Steps to reproduce
4. Browser/OS/Node version
5. Relevant logs (redact any secrets)

---

## Questions?

Open a [discussion](../../discussions) or reach out in issues. No question is too small.
