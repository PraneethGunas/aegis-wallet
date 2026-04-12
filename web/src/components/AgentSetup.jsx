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

  const handleCopy = () => {
    const config = JSON.stringify({
      mcpServers: {
        "aegis-wallet": {
          command: "node",
          args: ["backend/src/mcp/server.js", "--macaroon", credential.macaroon],
        },
      },
    }, null, 2);
    navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

        <motion.button
          whileTap={{ scale: 0.98 }}
          transition={spring}
          onClick={handleCopy}
          className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
            copied
              ? "bg-success-green/10 text-success-green border border-success-green/20"
              : "bg-secondary text-white"
          }`}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              Copied to clipboard
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy Claude config
            </>
          )}
        </motion.button>

        <p className="text-[11px] text-muted-foreground text-center">
          Paste into Claude Desktop settings to give Claude spending access
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
