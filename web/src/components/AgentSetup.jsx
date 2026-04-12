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

  const generatePrompt = () => `You are my financial agent with access to a real Bitcoin Lightning wallet.

YOUR WALLET:
You are connected to an LND Lightning node via the aegis-wallet MCP server.
Your spending limit is ${budgetSats.toLocaleString()} sats ($${budgetUsd}).
This limit is enforced cryptographically by LND — you cannot exceed it.

TOOLS:
- get_balance() — check how much you can spend
- pay_invoice(bolt11, purpose) — pay a Lightning invoice. Returns preimage on success.
- decode_invoice(bolt11) — decode a BOLT11 to see amount, description, expiry
- list_payments(limit) — view payment history
- create_invoice(amount_sats, memo) — generate an invoice to receive payment

SPENDING RULES:
- You can pay any invoice within your budget. No need to ask permission.
- If a payment is rejected with "insufficient balance", you've hit your limit. Tell me.
- Always tell me what you paid for, how much, and your remaining balance.

L402 PAYMENTS:
When you hit an HTTP 402 response:
1. Extract the BOLT11 invoice from the response
2. Call get_balance() to check if you can afford it
3. Call pay_invoice(bolt11, "what this pays for")
4. Use the returned preimage to retry: Authorization: L402 <macaroon>:<preimage>

DISCOVERING PAID SERVICES:
Use the 402index MCP tools to search 17,000+ paid API endpoints:
- search_services(category, protocol, health_status) — find L402/x402 APIs
- list_categories() — browse categories

CRITICAL:
- Use ONLY the MCP tools for payments. Never use shell commands or direct LND access.
- This is real Bitcoin on mainnet. Every payment uses real money.
- Always report what you spent and your remaining balance.

Ready. What would you like me to help you with?`;

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

        <motion.button
          whileTap={{ scale: 0.98 }}
          transition={spring}
          onClick={() => {
            const bundle = `=== CLAUDE DESKTOP CONFIG ===
Paste into Claude Desktop → Settings → Developer → Edit Config:

${JSON.stringify({
  mcpServers: {
    "aegis-wallet": {
      command: "npx",
      args: ["-y", "aegis-wallet", "--macaroon", credential.macaroon],
    },
    "402index": {
      command: "mcp-server",
    },
  },
}, null, 2)}

=== AGENT INSTRUCTIONS ===
Paste as your first message to Claude:

${generatePrompt()}`;
            navigator.clipboard.writeText(bundle);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
            copied
              ? "bg-success-green/10 text-success-green border border-success-green/20"
              : "bg-secondary text-white"
          }`}
        >
          {copied ? (
            <><Check className="w-4 h-4" /> Copied to clipboard</>
          ) : (
            <><Copy className="w-4 h-4" /> Copy setup for Claude</>
          )}
        </motion.button>

        <p className="text-[11px] text-muted-foreground text-center">
          Copies config + instructions. Paste config in settings, instructions in chat.
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
        disabled={creating || !budgetUsd || budgetSats < 1000}
        className="w-full py-3 rounded-xl bg-secondary text-white flex items-center justify-center gap-2 disabled:opacity-40 text-sm font-medium"
      >
        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
        {creating ? "Creating..." : "Generate credential"}
      </motion.button>
    </div>
  );
}
