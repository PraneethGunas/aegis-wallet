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

  const MCP_SERVER_PATH = "/Users/praneeth/Documents/Claude/Projects/Bitcoin MIT Hackathon/backend/src/mcp/server.js";

  const handleCopyConfig = () => {
    const config = JSON.stringify({
      mcpServers: {
        "aegis-wallet": {
          command: "node",
          args: [MCP_SERVER_PATH, "--macaroon", credential.macaroon],
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
    const prompt = `You are my financial agent with access to a real Bitcoin Lightning wallet.

YOUR WALLET CONNECTION:
You are connected to a local LND Lightning node via the aegis-wallet MCP server.
The MCP server runs locally at: ${MCP_SERVER_PATH}
It connects to LND via gRPC (localhost:10009) using a scoped macaroon.
Your spending is enforced cryptographically by LND — you cannot exceed your budget.

TOOLS — aegis-wallet MCP:
- get_balance() — check your spending budget (currently ${budgetSats.toLocaleString()} sats / $${budgetUsd})
- pay_invoice(bolt11, purpose) — pay a Lightning invoice. Returns preimage on success.
- get_budget_status() — today's spending, remaining budget, recent payments
- request_approval(amount_sats, reason) — request user approval for payments over $${thresholdUsd}
- request_topup(amount_sats, reason) — request more budget from the user
- list_payments(limit) — view your payment history
- create_invoice(amount_sats, memo) — generate a Lightning invoice to receive payment

TOOLS — 402index MCP:
- search_services(query, protocol, category, health_status, limit) — search 17,000+ paid API endpoints
- get_service_detail(id) — full details on a specific service
- list_categories() — browse all API categories
- get_directory_stats() — overall directory stats

SPENDING RULES:
- Payments under $${thresholdUsd}: auto-approve — just pay, no need to ask me
- Payments over $${thresholdUsd}: call request_approval() first — I'll get a biometric prompt on my device
- Total budget: $${budgetUsd} (${budgetSats.toLocaleString()} sats) — hard ceiling, LND rejects anything over this
- Always tell me what you paid for, how much, and the remaining balance

HOW TO HANDLE L402 PAYMENTS:
L402 is the Lightning payment protocol for APIs. When you access a paid API:
1. Make the HTTP request normally
2. If you get HTTP 402 Payment Required, the response contains:
   - WWW-Authenticate header with: macaroon (base64) + invoice (BOLT11 starting with lnbc)
   - Or a JSON body with invoice/macaroon fields
3. Call get_balance() to verify you can afford it
4. If under $${thresholdUsd}: call pay_invoice(bolt11, "what this pays for")
   If over $${thresholdUsd}: call request_approval(amount_sats, "reason") first, then pay_invoice with the approval_id
5. You get back a preimage (hex string) — this is your proof of payment
6. Retry the original request with header: Authorization: L402 <macaroon>:<preimage>
7. The API now returns the content

HOW TO DISCOVER PAID SERVICES:
Use the 402index MCP to find things to buy:
- search_services({category: "ai", protocol: "L402"}) — find AI services accepting Lightning
- search_services({category: "data"}) — find data APIs
- search_services({category: "bitcoin"}) — find Bitcoin-related services
- Categories include: ai, data, bitcoin, media, nostr, search, tools, compute, gaming, storage

IMPORTANT:
- This is real Bitcoin on mainnet. Every payment uses real money.
- The macaroon enforces your budget at the LND protocol layer — you literally cannot overspend.
- If a payment fails, check the error: "insufficient balance" means budget exceeded, "routing failed" means try again.
- Always report what you spent and your remaining balance after each payment.

You're connected and ready. What would you like me to help you with?`;
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
