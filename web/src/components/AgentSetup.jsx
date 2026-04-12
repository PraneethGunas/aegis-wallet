"use client";

import { useState } from "react";
import { Shield, Loader2, Copy, Check, Key } from "lucide-react";
import { motion } from "motion/react";
import * as api from "@/lib/api";

const spring = { type: "spring", stiffness: 300, damping: 24 };

export default function AgentSetup({ onPaired, btcPrice = 100000 }) {
  const [budgetUsd, setBudgetUsd] = useState("10");
  const [thresholdUsd, setThresholdUsd] = useState("2.50");
  const [creating, setCreating] = useState(false);
  const [credential, setCredential] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const budgetSats = Math.round((parseFloat(budgetUsd || 0) / btcPrice) * 1e8);
  const thresholdSats = Math.round((parseFloat(thresholdUsd || 0) / btcPrice) * 1e8);

  const handleGenerate = async () => {
    setCreating(true);
    setError(null);
    try {
      const result = await api.agent.create(budgetSats, thresholdSats);
      setCredential(result);
      onPaired?.();
    } catch (err) {
      setError(err.message);
    }
    setCreating(false);
  };

  const handleCopyConfig = () => {
    const config = JSON.stringify({
      mcpServers: {
        "aegis-wallet": {
          command: "node",
          args: ["backend/src/mcp/server.js", "--macaroon", credential.macaroon],
        },
        "402index": {
          command: "mcp-server",
        },
      },
    }, null, 2);
    navigator.clipboard.writeText(config);
    setCopied("config");
    setTimeout(() => setCopied(null), 2000);
  };

  const handleCopyPrompt = () => {
    const prompt = `You are my financial agent with access to a Bitcoin Lightning wallet via the aegis-wallet MCP tools.

WALLET TOOLS AVAILABLE:
- get_balance() — check your spending budget (${budgetSats.toLocaleString()} sats / $${budgetUsd})
- pay_invoice(bolt11, purpose) — pay a Lightning invoice within budget
- get_budget_status() — see today's spending and remaining budget
- request_approval(amount, reason) — ask me to approve payments over $${thresholdUsd}
- request_topup(amount, reason) — ask me for more budget if needed
- list_payments(limit) — view payment history
- create_invoice(amount, memo) — generate an invoice to receive payments

SPENDING RULES:
- Auto-approve payments under $${thresholdUsd} — just pay, don't ask
- Payments over $${thresholdUsd} — call request_approval first, I'll get a biometric prompt
- Budget ceiling: $${budgetUsd} total — enforced cryptographically, you literally cannot exceed it
- Always tell me what you're paying for and how much

L402 PAYMENTS (Lightning-gated APIs):
When you hit an HTTP 402 response with a Lightning invoice:
1. Extract the BOLT11 invoice and macaroon from the WWW-Authenticate header
2. Call get_balance() to check if you can afford it
3. Call pay_invoice(bolt11, "description of what this pays for")
4. Use the returned preimage + macaroon to retry the request with: Authorization: L402 <macaroon>:<preimage>

DISCOVERING PAID APIS:
Use the 402index MCP tools to search 17,000+ paid API endpoints:
- search_services(category, protocol, health_status) — find L402/x402 APIs
- get_service_detail(id) — full details on a service
- list_categories() — browse API categories

You're ready. Ask me what you'd like me to do.`;
    navigator.clipboard.writeText(prompt);
    setCopied("prompt");
    setTimeout(() => setCopied(null), 2000);
  };

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
            {budgetSats.toLocaleString()} sats · auto-approve under ${thresholdUsd}
          </p>
        </div>

        <div className="space-y-2">
          {/* Step 1: Config */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            transition={spring}
            onClick={handleCopyConfig}
            className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
              copied === "config"
                ? "bg-success-green/10 text-success-green border border-success-green/20"
                : "bg-secondary text-white"
            }`}
          >
            {copied === "config" ? (
              <><Check className="w-4 h-4" /> Config copied</>
            ) : (
              <><Copy className="w-4 h-4" /> 1. Copy Claude config</>
            )}
          </motion.button>

          {/* Step 2: Agent prompt */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            transition={spring}
            onClick={handleCopyPrompt}
            className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
              copied === "prompt"
                ? "bg-success-green/10 text-success-green border border-success-green/20"
                : "glass border border-border/50 text-foreground hover:bg-muted"
            }`}
          >
            {copied === "prompt" ? (
              <><Check className="w-4 h-4" /> Prompt copied</>
            ) : (
              <><Copy className="w-4 h-4" /> 2. Copy agent instructions</>
            )}
          </motion.button>
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          Step 1: Paste config into Claude Desktop settings.
          Step 2: Start a chat and paste the instructions.
        </p>
      </div>
    );
  }

  // ── Set limits ──────────────────────────────────────────────────
  return (
    <div className="p-5 rounded-xl glass border border-border/50 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-secondary" />
        <p className="text-sm font-medium">Spending policy</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Set limits for AI agents. Enforced cryptographically by Lightning.
      </p>

      {/* Budget */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">Total budget</span>
          <span className="font-mono text-xs">{budgetSats.toLocaleString()} sats</span>
        </div>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
          <input
            type="number"
            value={budgetUsd}
            onChange={(e) => setBudgetUsd(e.target.value)}
            placeholder="10.00"
            step="0.50"
            min="0.50"
            className="w-full pl-7 pr-4 py-2.5 rounded-lg bg-input border border-border/50 focus:border-secondary/50 focus:outline-none font-mono text-sm"
          />
        </div>
      </div>

      {/* Auto-pay threshold */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">Auto-approve up to</span>
          <span className="font-mono text-xs">${parseFloat(thresholdUsd || 0).toFixed(2)}</span>
        </div>
        <input
          type="range"
          min="0.50"
          max={budgetUsd || "10"}
          step="0.50"
          value={thresholdUsd}
          onChange={(e) => setThresholdUsd(e.target.value)}
          className="w-full"
        />
        <div className="flex justify-between font-mono text-[10px] text-muted-foreground mt-1">
          <span>$0.50</span>
          <span>${parseFloat(budgetUsd || 10).toFixed(0)}</span>
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
