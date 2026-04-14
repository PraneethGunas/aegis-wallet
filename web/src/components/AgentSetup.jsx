"use client";

import { useState } from "react";
import { Shield, Loader2, Copy, Check, Key } from "lucide-react";
import { motion } from "motion/react";
import * as api from "@/lib/api";

const spring = { type: "spring", stiffness: 300, damping: 24 };

export default function AgentSetup({ onPaired, btcPrice = 100000, credentialId = "default" }) {
  const [budgetUsd, setBudgetUsd] = useState("2.50");
  const [creating, setCreating] = useState(false);
  const [credential, setCredential] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [error, setError] = useState(null);

  const budgetSats = Math.round((parseFloat(budgetUsd || 0) / btcPrice) * 1e8);

  const handleGenerate = async () => {
    setCreating(true);
    setError(null);
    try {
      const result = await api.agent.create(budgetSats);
      setCredential(result);
      onPaired?.();
    } catch (err) {
      setError(err.message);
    }
    setCreating(false);
  };

  const generatePrompt = (macaroon) => `I'm using the Aegis wallet — a Bitcoin Lightning wallet with AI agent support. I've given you access to it via the aegis-wallet MCP server. Add this to your MCP config if it's not already there:

${JSON.stringify({ mcpServers: { "aegis-wallet": { command: "npx", args: ["-y", "aegis-wallet", "--macaroon", macaroon, "--api-url", process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001", "--user-id", credentialId] } } }, null, 2)}

This is a real wallet on Bitcoin mainnet with real money. Your spending limit is ${budgetSats.toLocaleString()} sats (~$${budgetUsd}), enforced cryptographically by LND.

You have these tools:

  get_balance()                             — your remaining spending balance
  pay_invoice(bolt11, purpose, max_cost_sats?) — pay a Lightning invoice (max_cost_sats refuses if invoice exceeds it)
  decode_invoice(bolt11)                    — inspect an invoice before paying
  list_payments(limit)                      — recent payment history
  create_invoice(amount_sats, memo)         — generate an invoice to receive a payment
  l402_fetch(url, method?, headers?, body?, max_cost_sats?) — fetch a URL with automatic L402 payment (handles 402 → pay → retry in one call, caches tokens per domain)
  get_spending_summary()                    — total spent, payment count, remaining balance, cached L402 domains

For L402 paywalled APIs, prefer l402_fetch — it handles the entire flow automatically: makes the request, extracts the invoice from the 402, pays it, caches the token, and retries. No manual steps needed. Tokens are cached per domain so you won't re-pay on subsequent requests.

Use max_cost_sats on pay_invoice or l402_fetch to set a per-payment safety cap. If the invoice exceeds it, the tool refuses to pay.

Pay any invoice within your balance — no approval needed. If a payment fails with "budget_exceeded", tell me — the invoice has been forwarded to my Aegis dashboard where I can pay it directly. After every payment, report what you paid, the cost, and your remaining balance.`;

  // ── After credential generated ──────────────────────────────────
  if (credential) {
    return (
      <div className="p-5 rounded-xl glass border border-border/50 space-y-4">
        <div className="w-10 h-10 rounded-full bg-success-green/10 flex items-center justify-center mx-auto">
          <Check className="w-5 h-5 text-success-green" />
        </div>

        <div className="text-center">
          <p className="text-sm font-medium mb-1">Spending limit set</p>
          <p className="font-mono text-2xl" style={{ fontWeight: 600 }}>
            ${parseFloat(budgetUsd).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {budgetSats.toLocaleString()} sats
          </p>
        </div>

        <div className="flex gap-2">
          <motion.button
            whileTap={{ scale: 0.98 }}
            transition={spring}
            onClick={() => {
              navigator.clipboard.writeText(generatePrompt(credential.macaroon));
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
              copied
                ? "bg-success-green/10 text-success-green border border-success-green/20"
                : "bg-secondary text-white"
            }`}
          >
            {copied ? (
              <><Check className="w-4 h-4" /> Copied</>
            ) : (
              <><Copy className="w-4 h-4" /> Copy setup for Claude</>
            )}
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.98 }}
            transition={spring}
            onClick={() => {
              const config = JSON.stringify({ mcpServers: { "aegis-wallet": { command: "npx", args: ["-y", "aegis-wallet", "--macaroon", credential.macaroon, "--api-url", process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001", "--user-id", credentialId] } } }, null, 2);
              navigator.clipboard.writeText(config);
              setCopiedConfig(true);
              setTimeout(() => setCopiedConfig(false), 2000);
            }}
            className={`py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
              copiedConfig
                ? "bg-success-green/10 text-success-green border border-success-green/20"
                : "bg-muted/50 text-muted-foreground border border-border/50 hover:text-foreground"
            }`}
          >
            {copiedConfig ? (
              <><Check className="w-4 h-4" /> Config</>
            ) : (
              <><Key className="w-4 h-4" /> Config only</>
            )}
          </motion.button>
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          Full setup includes MCP config + instructions. Config only copies the JSON for Claude Desktop settings.
        </p>
      </div>
    );
  }

  // ── Set spending limit ──────────────────────────────────────────
  return (
    <div className="p-5 rounded-xl glass border border-border/50 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-secondary" />
        <p className="text-sm font-medium">Spending limit</p>
      </div>
      <p className="text-xs text-muted-foreground">
        How much can the agent spend? Enforced cryptographically by Lightning.
      </p>

      {/* Budget slider + input */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-2xl" style={{ fontWeight: 600 }}>${parseFloat(budgetUsd || 0).toFixed(2)}</span>
          <span className="font-mono text-xs text-muted-foreground">{budgetSats.toLocaleString()} sats</span>
        </div>
        <input
          type="range"
          min="0.01"
          max="5"
          step="0.01"
          value={budgetUsd}
          onChange={(e) => setBudgetUsd(e.target.value)}
          className="w-full"
        />
        <div className="flex justify-between font-mono text-[10px] text-muted-foreground mt-1">
          <span>1 sat</span>
          <span>$5</span>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <motion.button
        whileTap={{ scale: 0.98 }}
        transition={spring}
        onClick={handleGenerate}
        disabled={creating || !budgetUsd || budgetSats < 1}
        className="w-full py-3 rounded-xl bg-secondary text-white flex items-center justify-center gap-2 disabled:opacity-40 text-sm font-medium"
      >
        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
        {creating ? "Creating..." : "Generate credential"}
      </motion.button>
    </div>
  );
}
