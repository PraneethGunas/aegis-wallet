"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Smartphone, ArrowLeft, AlertTriangle, Loader2, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useWallet } from "@/lib/store";
import * as api from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const { logout } = useWallet();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState(null);

  const handleWithdrawAll = async () => {
    if (!withdrawAddress) return;
    setWithdrawing(true);
    setError(null);
    try {
      await api.ln.withdraw(withdrawAddress);
      router.push("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setWithdrawing(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <div className="max-w-3xl mx-auto px-6 md:px-8 py-8 md:py-12">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>
          <h1 className="text-3xl md:text-4xl mb-2">Settings</h1>
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm"
          >
            {error}
          </motion.div>
        )}

        <div className="space-y-6">
          {/* Passkeys */}
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h2 className="text-lg mb-3" style={{ fontWeight: 500 }}>Passkey</h2>
            <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p style={{ fontWeight: 500 }}>This Device</p>
                <p className="text-sm text-muted-foreground">
                  Wallet key secured in device secure enclave
                </p>
              </div>
            </div>
          </motion.section>

          {/* Sign Out */}
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleLogout}
              className="px-6 py-3 rounded-xl border border-border hover:bg-muted transition-colors"
            >
              Sign Out
            </motion.button>
          </motion.section>

          {/* Advanced (collapsed) */}
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
              <span className="text-sm">Advanced</span>
            </button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 p-6 rounded-2xl bg-destructive/5 border border-destructive/30">
                    <div className="flex items-start gap-3 mb-4">
                      <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm mb-1" style={{ fontWeight: 500 }}>Withdraw All Funds</h3>
                        <p className="text-xs text-muted-foreground">
                          Send all funds to an external address. Cannot be undone.
                        </p>
                      </div>
                    </div>

                    {showWithdraw ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={withdrawAddress}
                          onChange={(e) => setWithdrawAddress(e.target.value)}
                          placeholder="bc1q... or bc1p..."
                          className="w-full px-4 py-2.5 rounded-xl bg-input border border-destructive/30 focus:border-destructive focus:outline-none text-sm"
                        />
                        <div className="flex gap-3">
                          <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={handleWithdrawAll}
                            disabled={!withdrawAddress || withdrawing}
                            className="flex-1 py-2.5 rounded-xl bg-destructive text-white disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                          >
                            {withdrawing && <Loader2 className="w-4 h-4 animate-spin" />}
                            {withdrawing ? "Withdrawing..." : "Confirm"}
                          </motion.button>
                          <button
                            onClick={() => setShowWithdraw(false)}
                            className="px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowWithdraw(true)}
                        className="px-4 py-2 rounded-xl border border-destructive/50 text-destructive text-sm hover:bg-destructive/10 transition-colors"
                      >
                        Withdraw All
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
