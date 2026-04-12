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
  const [copied, setCopied] = useState(null); // "token" | "config" | null
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

  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  if (credential) {
    const mcpConfig = JSON.stringify({
      mcpServers: {
        "aegis-wallet": {
          command: "node",
          args: ["backend/src/mcp/server.js", "--token", credential.authToken],
        },
      },
    }, null, 2);

    return (
      <div className="p-5 rounded-xl glass border border-border/50 space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-success-green" />
          <p className="text-sm font-medium">Agent credential ready</p>
        </div>

        <p className="text-xs text-muted-foreground">
          Budget: {budgetSats.toLocaleString()} sats (${budgetUsd}) — enforced by Lightning macaroon.
          Add this to your Claude config:
        </p>

        {/* MCP Config */}
        <div>
          <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-1.5">
            claude desktop config
          </p>
          <div className="flex items-start gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg glass border border-border/50 font-mono text-[10px] break-all leading-relaxed max-h-28 overflow-auto">
              {mcpConfig}
            </code>
            <button
              onClick={() => handleCopy(mcpConfig, "config")}
              className="p-2 rounded-lg glass border border-border/50 hover:bg-muted transition-colors flex-shrink-0"
            >
              {copied === "config" ? <Check className="w-3.5 h-3.5 text-success-green" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Auth Token */}
        <div>
          <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-1.5">
            auth token
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg glass border border-border/50 font-mono text-[10px] break-all">
              {credential.authToken}
            </code>
            <button
              onClick={() => handleCopy(credential.authToken, "token")}
              className="p-2 rounded-lg glass border border-border/50 hover:bg-muted transition-colors flex-shrink-0"
            >
              {copied === "token" ? <Check className="w-3.5 h-3.5 text-success-green" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          The macaroon is stored server-side. The agent only gets the auth token — it cannot exceed the budget.
        </p>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-xl glass border border-border/50 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-secondary" />
        <p className="text-sm font-medium">Spending policy</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Set limits for AI agents. Enforced cryptographically by Lightning — no app code can override.
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
