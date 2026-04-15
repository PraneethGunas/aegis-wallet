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

  const generateConfig = (macaroon) => JSON.stringify({
    mcpServers: {
      "aegis-wallet": {
        command: "npx",
        args: ["-y", "aegis-wallet"],
        env: {
          LND_MACAROON_BASE64: macaroon,
          LND_REST_HOST: "https://localhost:8080",
          AEGIS_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
          AEGIS_WALLET_ID: credentialId,
          NODE_TLS_REJECT_UNAUTHORIZED: "0",
        },
      },
    },
  }, null, 2);

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
            navigator.clipboard.writeText(generateConfig(credential.macaroon));
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
            <><Copy className="w-4 h-4" /> Copy MCP config</>
          )}
        </motion.button>

        <p className="text-[11px] text-muted-foreground text-center">
          Paste into Claude Desktop → Settings → Developer → Edit Config
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
