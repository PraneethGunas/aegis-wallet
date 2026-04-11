"use client";

import { useState } from "react";
import { Bot, Loader2, Copy, Check } from "lucide-react";
import { motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import * as api from "@/lib/api";

const spring = { type: "spring", stiffness: 300, damping: 24 };

export default function AgentSetup({ onPaired }) {
  const [creating, setCreating] = useState(false);
  const [pairingConfig, setPairingConfig] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await api.agent.create(50000, 250);
      const pairing = await api.agent.pair();
      setPairingConfig(pairing);
    } catch (err) {
      setError(err.message);
    }
    setCreating(false);
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (pairingConfig) {
    const cmd = pairingConfig.pairingCommand || JSON.stringify(pairingConfig.mcpConfig, null, 2);
    return (
      <div className="p-5 rounded-xl glass border border-border/50 space-y-5">
        <div className="text-center">
          <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center mx-auto mb-3">
            <Bot className="w-[18px] h-[18px] text-secondary" />
          </div>
          <p className="text-sm font-medium mb-0.5">Pair Claude</p>
          <p className="text-xs text-muted-foreground">Add this MCP server to Claude Code</p>
        </div>

        <div className="flex justify-center">
          <div className="p-3 bg-white rounded-xl border border-border/30">
            <QRCodeSVG value={cmd} size={140} />
          </div>
        </div>

        <div>
          <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-1.5">cli command</p>
          <div className="flex items-start gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg glass border border-border/50 font-mono text-[11px] break-all leading-relaxed">
              {cmd}
            </code>
            <button
              onClick={() => handleCopy(cmd)}
              className="p-2 rounded-lg glass border border-border/50 hover:bg-muted transition-colors flex-shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-success-green" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          transition={spring}
          onClick={() => onPaired?.()}
          className="w-full py-2.5 rounded-xl bg-secondary text-white text-sm font-medium"
        >
          I&apos;ve connected Claude
        </motion.button>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-xl glass border border-dashed border-border/50 text-center space-y-4">
      <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center mx-auto">
        <Bot className="w-[18px] h-[18px] text-secondary/60" />
      </div>
      <div>
        <p className="text-sm font-medium mb-0.5">Connect Claude</p>
        <p className="text-xs text-muted-foreground">Set up your AI agent to handle payments</p>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <motion.button
        whileTap={{ scale: 0.95 }}
        transition={spring}
        onClick={handleCreate}
        disabled={creating}
        className="px-5 py-2.5 rounded-xl bg-secondary text-white text-sm font-medium flex items-center gap-2 mx-auto disabled:opacity-60"
      >
        {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
        {creating ? "Creating..." : "Create agent"}
      </motion.button>
    </div>
  );
}
