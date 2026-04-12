"use client";

import { useState } from "react";
import {
  Fingerprint, Loader2, Check, ExternalLink, Zap, AlertCircle, RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useWallet } from "@/lib/store";

const MEMPOOL_URL = "https://mempool.space";
const MIN_CHANNEL_SATS = 20000;

const spring = { type: "spring", stiffness: 300, damping: 24 };

export default function FundAgentFlow({ isOpen, onClose, balance, btcPrice }) {
  const { funding, fundAgent, resetFunding } = useWallet();
  const [amountUsd, setAmountUsd] = useState("");

  const l1Sats = balance?.l1Sats || 0;
  const l1Usd = balance?.l1Usd || 0;
  const satsAmount = amountUsd ? Math.round((parseFloat(amountUsd) / btcPrice) * 1e8) : 0;
  const step = funding.step;

  const handleConfirm = () => {
    if (satsAmount < MIN_CHANNEL_SATS) return;
    fundAgent(satsAmount);
  };

  const handleDone = () => {
    resetFunding();
    onClose();
  };

  const handleRetry = () => {
    resetFunding();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden"
        >
          <div className="p-5 rounded-xl glass border border-border/50 mt-3">

            {/* ── Entering amount ───────────────────────────── */}
            {(step === "idle") && (
              <div className="space-y-4">
                <p className="text-sm font-medium">Fund Lightning Channel</p>
                <p className="text-xs text-muted-foreground">
                  Move sats from savings to a Lightning channel. Minimum 20,000 sats.
                </p>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Available: {l1Sats.toLocaleString()} sats (${l1Usd.toFixed(2)})</span>
                  {l1Sats < MIN_CHANNEL_SATS && (
                    <span className="text-amber-500">Need {MIN_CHANNEL_SATS.toLocaleString()}+ sats</span>
                  )}
                </div>

                <div className="flex gap-2">
                  {[5, 10, 15].map((usd) => (
                    <button
                      key={usd}
                      onClick={() => setAmountUsd(String(usd))}
                      className={`flex-1 py-2 rounded-lg font-mono text-sm transition-colors ${
                        amountUsd === String(usd)
                          ? "bg-secondary/15 text-secondary border border-secondary/30"
                          : "glass border border-border/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      ${usd}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
                  <input
                    type="number"
                    value={amountUsd}
                    onChange={(e) => setAmountUsd(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    className="w-full pl-7 pr-4 py-2.5 rounded-lg bg-input border border-border/50 focus:border-secondary/50 focus:outline-none font-mono text-sm"
                  />
                </div>

                {satsAmount > 0 && (
                  <p className="text-xs text-muted-foreground font-mono text-center">
                    {satsAmount.toLocaleString()} sats
                  </p>
                )}

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  transition={spring}
                  onClick={handleConfirm}
                  disabled={!amountUsd || satsAmount < MIN_CHANNEL_SATS || l1Sats < MIN_CHANNEL_SATS}
                  className="w-full py-3 rounded-xl bg-secondary text-white flex items-center justify-center gap-2 disabled:opacity-40 text-sm font-medium"
                >
                  <Fingerprint className="w-4 h-4" />
                  Confirm with passkey
                </motion.button>
              </div>
            )}

            {/* ── Signing ──────────────────────────────────── */}
            {step === "signing" && (
              <div className="py-8 text-center space-y-3">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-secondary" />
                <p className="text-sm font-medium">Signing with passkey...</p>
                <p className="text-xs text-muted-foreground">Confirm biometric to authorize</p>
              </div>
            )}

            {/* ── Broadcasting ─────────────────────────────── */}
            {step === "broadcasting" && (
              <div className="py-8 text-center space-y-3">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-secondary" />
                <p className="text-sm font-medium">Broadcasting transaction...</p>
              </div>
            )}

            {/* ── Confirming on-chain ──────────────────────── */}
            {step === "confirming" && (
              <div className="py-8 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
                  <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
                </div>
                <p className="text-sm font-medium">Confirming on-chain...</p>
                <p className="text-xs text-muted-foreground">
                  Waiting for block confirmation (~10 min)
                </p>
                {funding.txid && (
                  <a
                    href={`${MEMPOOL_URL}/tx/${funding.txid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-secondary hover:underline flex items-center justify-center gap-1"
                  >
                    View on mempool.space <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            )}

            {/* ── Opening channel ──────────────────────────── */}
            {step === "opening_channel" && (
              <div className="py-8 text-center space-y-3">
                <Zap className="w-6 h-6 text-secondary mx-auto animate-pulse" />
                <p className="text-sm font-medium">Opening Lightning channel...</p>
                <p className="text-xs text-muted-foreground">
                  Connecting to ACINQ. This may take 10-30 minutes.
                </p>
              </div>
            )}

            {/* ── Ready ────────────────────────────────────── */}
            {step === "ready" && (
              <div className="py-8 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-success-green/10 flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6 text-success-green" />
                </div>
                <div>
                  <p className="text-sm font-medium">Lightning channel active</p>
                  <p className="text-xs text-muted-foreground">Your agent can now make payments</p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  transition={spring}
                  onClick={handleDone}
                  className="px-6 py-2.5 rounded-xl bg-secondary text-white text-sm font-medium mx-auto"
                >
                  Done
                </motion.button>
              </div>
            )}

            {/* ── Error ────────────────────────────────────── */}
            {step === "error" && (
              <div className="py-6 text-center space-y-3">
                <AlertCircle className="w-6 h-6 text-destructive mx-auto" />
                <p className="text-sm font-medium text-destructive">Something went wrong</p>
                <p className="text-xs text-muted-foreground">{funding.error}</p>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  transition={spring}
                  onClick={handleRetry}
                  className="px-5 py-2 rounded-xl glass border border-border/50 text-sm flex items-center gap-2 mx-auto"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Try again
                </motion.button>
              </div>
            )}

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
