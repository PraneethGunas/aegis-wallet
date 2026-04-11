"use client";

import { Bot, Fingerprint, ArrowUp, Clock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";

const spring = { type: "spring", stiffness: 300, damping: 24 };

export default function ApprovalBanner({ approval, onApprove, onDeny, btcPrice = 100000 }) {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!approval?.expiresAt) return;
    const update = () => {
      const remaining = Math.max(0, Math.floor((new Date(approval.expiresAt) - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [approval?.expiresAt]);

  if (!approval) return null;

  const amountUsd = ((approval.amountSats / 1e8) * btcPrice).toFixed(2);
  const isTopup = approval.type === "topup";
  const mins = timeLeft ? Math.floor(timeLeft / 60) : 0;
  const secs = timeLeft ? timeLeft % 60 : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -8 }}
        transition={spring}
        className="fixed top-4 left-4 right-4 md:left-20 z-50"
      >
        <div className="mx-auto max-w-xl">
          <div className="rounded-2xl glass-strong border border-primary/20 p-5 glow-orange">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                {isTopup ? <ArrowUp className="w-5 h-5 text-secondary" /> : <Bot className="w-5 h-5 text-secondary" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium truncate">
                    {isTopup ? "Budget top-up" : "Payment request"}
                  </p>
                  {timeLeft !== null && timeLeft > 0 && (
                    <span className="pill bg-amber-500/15 text-amber-400">
                      <Clock className="w-2.5 h-2.5" />
                      {mins}:{secs.toString().padStart(2, "0")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mb-3">
                  {approval.reason || "Claude is requesting approval"}
                </p>

                <div className="flex items-center gap-3">
                  <span className="font-mono text-2xl" style={{ fontWeight: 600, letterSpacing: "-0.03em" }}>
                    ${amountUsd}
                  </span>

                  <div className="flex gap-2 ml-auto">
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      transition={spring}
                      onClick={onDeny}
                      className="px-4 py-2 rounded-lg border border-destructive/20 text-destructive text-xs font-medium hover:bg-destructive/10 transition-colors"
                    >
                      Deny
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      transition={spring}
                      onClick={onApprove}
                      className="px-4 py-2 rounded-lg bg-success-green text-white text-xs font-medium flex items-center gap-1.5"
                    >
                      <Fingerprint className="w-3.5 h-3.5" />
                      Approve
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
