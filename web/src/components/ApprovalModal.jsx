"use client";

import { Bot, Fingerprint, X, Clock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function ApprovalModal({
  isOpen,
  onClose,
  onApprove,
  onDeny,
  type = "payment",
  amount = 0,
  reason = "",
  isUrgent = false,
}) {
  const satsEquivalent = Math.round((amount / 62850) * 100000000);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-card border border-border rounded-3xl p-8 max-w-md w-full relative"
            >
              <button
                onClick={onClose}
                className="absolute top-6 right-6 w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              {isUrgent && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center gap-2"
                >
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="text-sm text-amber-500">Time-sensitive request</span>
                </motion.div>
              )}

              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-secondary to-secondary/50 flex items-center justify-center mx-auto mb-6">
                <Bot className="w-10 h-10 text-white" />
              </div>

              <h2 className="text-2xl text-center mb-2">
                {type === "payment"
                  ? "Claude wants to make a payment"
                  : "Claude needs more budget"}
              </h2>

              <p className="text-center text-muted-foreground mb-6">{reason}</p>

              <div className="p-6 rounded-2xl bg-muted/50 border border-border mb-6 text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  {type === "payment" ? "Payment Amount" : "Requested Budget"}
                </p>
                <p className="text-4xl mb-1" style={{ fontWeight: 600 }}>
                  ${amount.toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {satsEquivalent.toLocaleString()} sats
                </p>
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onDeny}
                  className="flex-1 px-6 py-4 rounded-xl border border-border hover:bg-muted transition-colors"
                >
                  Deny
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onApprove}
                  className="flex-1 px-6 py-4 rounded-xl bg-success-green text-white flex items-center justify-center gap-2"
                >
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <Fingerprint className="w-5 h-5" />
                  </motion.div>
                  Approve
                </motion.button>
              </div>

              <p className="text-xs text-muted-foreground text-center mt-4">
                You&apos;ll be prompted for biometric authentication to approve
              </p>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
