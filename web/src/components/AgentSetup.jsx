"use client";

import { useState, useEffect } from "react";
import { Shield, Loader2, Copy, Check, Key, Terminal, Settings2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import * as api from "@/lib/api";

const spring = { type: "spring", stiffness: 300, damping: 24 };

export default function AgentSetup({ onPaired, btcPrice = 100000, credentialId = "default", existingAgent = null, l2BalanceSats = 0 }) {
  const [budgetUsd, setBudgetUsd] = useState("2.50");
  const [creating, setCreating] = useState(false);
  const [credential, setCredential] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);
  const [editing, setEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);

  const budgetSats = Math.round((parseFloat(budgetUsd || 0) / btcPrice) * 1e8);
  const maxUsd = btcPrice > 0 ? ((l2BalanceSats / 1e8) * btcPrice).toFixed(2) : "5.00";

  // Seed slider with current budget on first render only
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!seeded && existingAgent?.budgetSats && btcPrice > 0) {
      setBudgetUsd(((existingAgent.budgetSats / 1e8) * btcPrice).toFixed(2));
      setSeeded(true);
    }
  }, [seeded, existingAgent?.budgetSats, btcPrice]);

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

  const handleUpdateBudget = async () => {
    setUpdating(true);
    setError(null);
    try {
      await api.agent.updateBudget(budgetSats, existingAgent.id);
      setEditing(false);
      onPaired?.();
    } catch (err) {
      setError(err.message);
    }
    setUpdating(false);
  };

  const satsToUsd = (sats) => btcPrice > 0 ? ((sats / 1e8) * btcPrice).toFixed(2) : "0.00";

  const generateCli = (macaroon) =>
    `claude mcp add lightning-wallet-mcp -e 'LND_MACAROON_BASE64=${macaroon}' -e LND_REST_HOST=https://localhost:8080 -e NODE_TLS_REJECT_UNAUTHORIZED=0 -e AEGIS_WEBHOOK_URL=${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/agent/webhook -- npx lightning-wallet-mcp`;

  const generateConfig = (macaroon) => JSON.stringify({
    mcpServers: {
      "lightning-wallet-mcp": {
        command: "npx",
        args: ["-y", "lightning-wallet-mcp"],
        env: {
          LND_MACAROON_BASE64: macaroon,
          LND_REST_HOST: "https://localhost:8080",
          AEGIS_WEBHOOK_URL: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/agent/webhook`,
          NODE_TLS_REJECT_UNAUTHORIZED: "0",
        },
      },
    },
  }, null, 2);

  // ── Slider UI (shared between create and edit) ──────────────────
  const SliderControl = ({ label }) => (
    <div>
      <div className="flex items-center justify-between mb-2">
        {label && <span className="text-xs text-muted-foreground">{label}</span>}
        <span className="font-mono text-sm" style={{ fontWeight: 500 }}>
          ${parseFloat(budgetUsd || 0).toFixed(2)}
          <span className="text-muted-foreground ml-1.5 text-xs font-normal">
            {budgetSats.toLocaleString()} sats
          </span>
        </span>
      </div>
      <input
        type="range"
        min="0.01"
        max={maxUsd}
        step="0.01"
        value={budgetUsd}
        onChange={(e) => setBudgetUsd(e.target.value)}
        className="w-full"
      />
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground mt-1">
        <span>1 sat</span>
        <span>${maxUsd}</span>
      </div>
    </div>
  );

  // ── Copy buttons (shared) ───────────────────────────────────────
  const CopyButtons = ({ macaroon }) => (
    <div className="flex gap-2">
      <motion.button
        whileTap={{ scale: 0.98 }}
        transition={spring}
        onClick={() => {
          navigator.clipboard.writeText(generateConfig(macaroon));
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-medium transition-colors ${
          copied
            ? "bg-success-green/10 text-success-green border border-success-green/20"
            : "bg-muted/50 text-muted-foreground border border-border/50 hover:text-foreground"
        }`}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? "Copied" : "MCP config"}
      </motion.button>

      <motion.button
        whileTap={{ scale: 0.98 }}
        transition={spring}
        onClick={() => {
          navigator.clipboard.writeText(generateCli(macaroon));
          setCopiedCli(true);
          setTimeout(() => setCopiedCli(false), 2000);
        }}
        className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-medium transition-colors ${
          copiedCli
            ? "bg-success-green/10 text-success-green border border-success-green/20"
            : "bg-muted/50 text-muted-foreground border border-border/50 hover:text-foreground"
        }`}
      >
        {copiedCli ? <Check className="w-3.5 h-3.5" /> : <Terminal className="w-3.5 h-3.5" />}
        {copiedCli ? "Copied" : "CLI command"}
      </motion.button>
    </div>
  );

  // ── Existing agent ──────────────────────────────────────────────
  if (existingAgent && !credential) {
    const balanceSats = existingAgent.balanceSats ?? existingAgent.budgetSats;
    const walletPct = l2BalanceSats > 0 ? Math.min(100, (balanceSats / l2BalanceSats) * 100) : 0;

    return (
      <div className="p-5 rounded-xl glass border border-border/50 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-secondary" />
            <p className="text-sm font-medium">Agent budget</p>
          </div>
          <button
            onClick={() => setEditing(!editing)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Settings2 className="w-3 h-3" />
            {editing ? "Cancel" : "Adjust"}
          </button>
        </div>

        {/* Balance */}
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl" style={{ fontWeight: 600 }}>
              ${satsToUsd(balanceSats)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {balanceSats.toLocaleString()} sats
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Available for the agent to spend. Enforced by LND.
          </p>
        </div>

        {/* Edit slider */}
        <AnimatePresence>
          {editing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden"
            >
              <div className="pt-2 border-t border-border/50">
                <SliderControl label="New limit" />
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <motion.button
                whileTap={{ scale: 0.98 }}
                transition={spring}
                onClick={handleUpdateBudget}
                disabled={updating}
                className="w-full py-2.5 rounded-xl bg-secondary text-white flex items-center justify-center gap-2 disabled:opacity-40 text-sm font-medium"
              >
                {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                {updating ? "Updating..." : "Update limit"}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Copy buttons */}
        {existingAgent.macaroon && <CopyButtons macaroon={existingAgent.macaroon} />}
      </div>
    );
  }

  // ── Just created ────────────────────────────────────────────────
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

        <CopyButtons macaroon={credential.macaroon} />

        <p className="text-[11px] text-muted-foreground text-center">
          JSON config for Claude Desktop. CLI command for Claude Code.
        </p>
      </div>
    );
  }

  // ── No agent: create ────────────────────────────────────────────
  return (
    <div className="p-5 rounded-xl glass border border-border/50 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-secondary" />
        <p className="text-sm font-medium">Spending limit</p>
      </div>
      <p className="text-xs text-muted-foreground">
        How much can the agent spend? Enforced cryptographically by Lightning.
      </p>

      <SliderControl />

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
