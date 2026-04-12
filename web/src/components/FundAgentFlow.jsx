"use client";

import { useState, useEffect } from "react";
import {
  Fingerprint, Loader2, Check, ExternalLink, Zap, AlertCircle, RefreshCw, Plus,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useWallet } from "@/lib/store";
import * as api from "@/lib/api";

const MEMPOOL_URL = "https://mempool.space";
const MIN_CHANNEL_SATS = 20000;

const spring = { type: "spring", stiffness: 300, damping: 24 };

export default function FundAgentFlow({ isOpen, onClose, balance, btcPrice }) {
  const { funding, fundAgent, resetFunding } = useWallet();
  const [amountUsd, setAmountUsd] = useState("");
  const [hasChannel, setHasChannel] = useState(null); // null = loading, true/false
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupDone, setTopupDone] = useState(false);

  const l1Sats = balance?.l1Sats || 0;
  const l1Usd = balance?.l1Usd || 0;
  const l2Sats = balance?.l2Sats || 0;
  const satsAmount = amountUsd ? Math.round((parseFloat(amountUsd) / btcPrice) * 1e8) : 0;
  const step = funding.step;

  // Check if channel exists when opened
  useEffect(() => {
    if (!isOpen) return;
    setTopupDone(false);
    (async () => {
      try {
        const { channels } = await api.ln.getChannels();
        setHasChannel(channels.length > 0);
      } catch {
        setHasChannel(false);
      }
    })();
  }, [isOpen]);

  const handleConfirm = () => {
    if (satsAmount < MIN_CHANNEL_SATS) return;
    fundAgent(satsAmount);
  };

  const handleTopup = async () => {
    setTopupLoading(true);
    try {
      const sats = Math.round((parseFloat(amountUsd) / btcPrice) * 1e8);
      await api.agent.topup(sats);
      setTopupDone(true);
    } catch {}
    setTopupLoading(false);
  };

  const handleDone = () => {
    resetFunding();
    setTopupDone(false);
    onClose();
  };

  const handleRetry = () => {
    resetFunding();
  };

  // Still checking channel status
  if (hasChannel === null && isOpen) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <div className="p-5 rounded-xl glass border border-border/50 mt-3 py-8 text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

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

            {/* ══════════════════════════════════════════════════ */}
            {/* HAS CHANNEL → Top up agent budget                 */}
            {/* ══════════════════════════════════════════════════ */}
            {hasChannel && step === "idle" && !topupDone && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-success-green" />
                  <p className="text-sm font-medium">Top up agent budget</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Lightning channel active. Add more sats to the agent&apos;s spending budget.
                </p>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Channel balance: {l2Sats.toLocaleString()} sats</span>
                </div>

                <div className="flex gap-2">
                  {[1000, 5000, 10000].map((sats) => {
                    const usd = ((sats / 1e8) * btcPrice).toFixed(2);
                    return (
                      <button
                        key={sats}
                        onClick={() => setAmountUsd(usd)}
                        className={`flex-1 py-2 rounded-lg font-mono text-xs transition-colors ${
                          amountUsd === usd
                            ? "bg-secondary/15 text-secondary border border-secondary/30"
                            : "glass border border-border/50 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {sats >= 1000 ? `${sats / 1000}k` : sats} sats
                      </button>
                    );
                  })}
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

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  transition={spring}
                  onClick={handleTopup}
                  disabled={!amountUsd || topupLoading}
                  className="w-full py-3 rounded-xl bg-secondary text-white flex items-center justify-center gap-2 disabled:opacity-40 text-sm font-medium"
                >
                  {topupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {topupLoading ? "Adding..." : "Add to budget"}
                </motion.button>
              </div>
            )}

            {hasChannel && topupDone && (
              <div className="py-8 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-success-green/10 flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6 text-success-green" />
                </div>
                <p className="text-sm font-medium">Budget updated</p>
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

            {/* ══════════════════════════════════════════════════ */}
            {/* NO CHANNEL → Open channel flow                    */}
            {/* ══════════════════════════════════════════════════ */}
            {!hasChannel && step === "idle" && (
              <div className="space-y-4">
                <p className="text-sm font-medium">Open Lightning Channel</p>
                <p className="text-xs text-muted-foreground">
                  Move sats from savings to a Lightning channel. Minimum {MIN_CHANNEL_SATS.toLocaleString()} sats.
                </p>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Available: {l1Sats.toLocaleString()} sats (${l1Usd.toFixed(2)})</span>
                  {l1Sats < MIN_CHANNEL_SATS && (
                    <span className="text-amber-500">Need {MIN_CHANNEL_SATS.toLocaleString()}+ sats</span>
                  )}
                </div>

                <div className="flex gap-2">
                  {[Math.ceil(l1Usd * 0.5), Math.ceil(l1Usd * 0.75), Math.ceil(l1Usd)].filter(v => v > 0).map((usd) => (
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
                  <p className={`text-xs font-mono text-center ${satsAmount < MIN_CHANNEL_SATS ? "text-amber-500" : "text-muted-foreground"}`}>
                    {satsAmount.toLocaleString()} sats
                    {satsAmount < MIN_CHANNEL_SATS && ` (min ${MIN_CHANNEL_SATS.toLocaleString()})`}
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

            {/* ══════════════════════════════════════════════════ */}
            {/* Progress states (shared for both flows)           */}
            {/* ══════════════════════════════════════════════════ */}

            {step === "signing" && (
              <div className="py-8 text-center space-y-3">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-secondary" />
                <p className="text-sm font-medium">Signing with passkey...</p>
                <p className="text-xs text-muted-foreground">Confirm biometric to authorize</p>
              </div>
            )}

            {step === "broadcasting" && (
              <div className="py-8 text-center space-y-3">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-secondary" />
                <p className="text-sm font-medium">Broadcasting transaction...</p>
              </div>
            )}

            {step === "confirming" && (
              <div className="py-8 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
                  <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
                </div>
                <p className="text-sm font-medium">Confirming on-chain...</p>
                <p className="text-xs text-muted-foreground">Waiting for block confirmation (~10 min)</p>
                {funding.txid && (
                  <a href={`${MEMPOOL_URL}/tx/${funding.txid}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-secondary hover:underline flex items-center justify-center gap-1">
                    View on mempool.space <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            )}

            {step === "opening_channel" && (
              <div className="py-8 text-center space-y-3">
                <Zap className="w-6 h-6 text-secondary mx-auto animate-pulse" />
                <p className="text-sm font-medium">Opening Lightning channel...</p>
                <p className="text-xs text-muted-foreground">Connecting to ACINQ. May take 10-30 minutes.</p>
              </div>
            )}

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
