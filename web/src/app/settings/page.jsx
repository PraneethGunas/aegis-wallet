"use client";

import { useState } from "react";
import Link from "next/link";
import { Fingerprint, Plus, Smartphone, ArrowLeft, AlertTriangle } from "lucide-react";
import { motion } from "motion/react";

export default function SettingsPage() {
  const [autoPayLimit, setAutoPayLimit] = useState(2.5);
  const [currency, setCurrency] = useState("USD");

  // TODO: Fetch real passkey list from backend
  const passkeys = [
    { id: 1, name: "iPhone 15 Pro", added: "Apr 8, 2026" },
    { id: 2, name: "MacBook Pro", added: "Apr 8, 2026" },
  ];

  const handleWithdrawAll = () => {
    // TODO: Prompt for address, trigger passkey signing, call api.ln.withdraw()
  };

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <div className="max-w-3xl mx-auto px-6 md:px-8 py-8 md:py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Link>
          <h1 className="text-3xl md:text-4xl mb-2">Settings</h1>
          <p className="text-muted-foreground">
            Manage your wallet preferences
          </p>
        </motion.div>

        <div className="space-y-8">
          {/* Passkeys */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-xl mb-4">Passkeys</h2>
            <div className="space-y-3">
              {passkeys.map((passkey, index) => (
                <motion.div
                  key={passkey.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + index * 0.05 }}
                  className="p-4 rounded-xl bg-card border border-border flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <Smartphone className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p style={{ fontWeight: 500 }}>{passkey.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Added {passkey.added}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full p-4 rounded-xl border border-dashed border-border hover:bg-muted transition-colors flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <Plus className="w-5 h-5" />
                <span>Add Backup Passkey</span>
              </motion.button>
            </div>
          </motion.section>

          {/* Auto-pay Limit */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-xl mb-4">Auto-approve Limit</h2>
            <div className="p-6 rounded-2xl bg-card border border-border">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="mb-1" style={{ fontWeight: 500 }}>
                    Payment threshold
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Claude can auto-approve payments under this amount
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl" style={{ fontWeight: 600 }}>
                    ${autoPayLimit.toFixed(2)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {Math.round(
                      (autoPayLimit / 62850) * 100000000
                    ).toLocaleString()}{" "}
                    sats
                  </p>
                </div>
              </div>
              <input
                type="range"
                min="0.50"
                max="50.00"
                step="0.50"
                value={autoPayLimit}
                onChange={(e) => setAutoPayLimit(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none bg-muted cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-secondary"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                <span>$0.50</span>
                <span>$50.00</span>
              </div>
            </div>
          </motion.section>

          {/* Currency Preference */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <h2 className="text-xl mb-4">Default Currency</h2>
            <div className="grid grid-cols-3 gap-3">
              {["USD", "EUR", "GBP"].map((curr) => (
                <motion.button
                  key={curr}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setCurrency(curr)}
                  className={`p-4 rounded-xl border transition-all ${
                    currency === curr
                      ? "bg-primary/10 border-primary text-foreground"
                      : "bg-card border-border hover:bg-muted"
                  }`}
                >
                  <p style={{ fontWeight: 500 }}>{curr}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {curr === "USD" && "US Dollar"}
                    {curr === "EUR" && "Euro"}
                    {curr === "GBP" && "Pound"}
                  </p>
                </motion.button>
              ))}
            </div>
          </motion.section>

          {/* Agent Connection */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <h2 className="text-xl mb-4">Agent Connection</h2>
            <div className="p-6 rounded-2xl bg-card border border-border">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="mb-1" style={{ fontWeight: 500 }}>
                    Claude is connected
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Active since Apr 8, 2026
                  </p>
                </div>
                <div className="w-3 h-3 rounded-full bg-success-green animate-pulse" />
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full px-4 py-3 rounded-xl border border-border hover:bg-muted transition-colors text-sm"
              >
                Regenerate Auth Token
              </motion.button>
            </div>
          </motion.section>

          {/* Danger Zone */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <h2 className="text-xl text-destructive mb-4">Danger Zone</h2>
            <div className="p-6 rounded-2xl bg-destructive/5 border border-destructive/30">
              <div className="flex items-start gap-4 mb-6">
                <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0 mt-1" />
                <div>
                  <h3 className="mb-2" style={{ fontWeight: 500 }}>
                    Withdraw Everything
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Send all funds from both wallets to an external Bitcoin
                    address. This action cannot be undone.
                  </p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleWithdrawAll}
                className="w-full px-6 py-3 rounded-xl border border-destructive text-destructive hover:bg-destructive hover:text-white transition-colors"
              >
                Withdraw All Funds
              </motion.button>
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
