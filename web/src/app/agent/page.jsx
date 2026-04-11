"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, Check, X, Pause, Power, ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import PairingQR from "@/components/PairingQR";

// TODO: Replace with real data from API + WebSocket
const MOCK_ACTIVITIES = [
  { id: 1, action: "Paid for coolproject.co domain", amount: 12.99, status: "auto-approved", timestamp: "2 hours ago" },
  { id: 2, action: "Requested budget top-up", amount: 25.0, status: "approved", timestamp: "1 day ago" },
  { id: 3, action: "Paid for OpenAI API credits", amount: 8.5, status: "auto-approved", timestamp: "1 day ago" },
  { id: 4, action: "Paid for GitHub Pro subscription", amount: 4.0, status: "auto-approved", timestamp: "2 days ago" },
  { id: 5, action: "Requested AWS credits purchase", amount: 50.0, status: "denied", timestamp: "3 days ago" },
];

function satsToDisplay(spent, budget) {
  const spentSats = Math.round((spent / 62850) * 100000000);
  const budgetSats = Math.round((budget / 62850) * 100000000);
  return `${spentSats.toLocaleString()} / ${budgetSats.toLocaleString()} sats`;
}

export default function AgentPage() {
  const [isPaired, setIsPaired] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [autoPayLimit, setAutoPayLimit] = useState(2.5);

  const budget = 25.0;
  const spent = 6.2;
  const percentUsed = (spent / budget) * 100;

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <div className="max-w-4xl mx-auto px-6 md:px-8 py-8 md:py-12">
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
          <h1 className="text-3xl md:text-4xl mb-2">Agent Dashboard</h1>
          <p className="text-muted-foreground">
            Manage Claude&apos;s spending and permissions
          </p>
        </motion.div>

        {isPaired ? (
          <div className="space-y-6">
            {/* Agent Status Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="p-6 rounded-2xl bg-gradient-to-br from-secondary/10 to-transparent border border-secondary/30"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-secondary to-secondary/50 flex items-center justify-center">
                    <Bot className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl mb-1">Claude</h2>
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isActive
                            ? "bg-success-green animate-pulse"
                            : "bg-amber-500"
                        }`}
                      />
                      <span className="text-muted-foreground">
                        {isActive ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Connected since Apr 8, 2026
                    </p>
                  </div>
                </div>
              </div>

              {/* Budget Progress */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Budget Used</span>
                  <span className="text-lg" style={{ fontWeight: 500 }}>
                    ${spent.toFixed(2)} / ${budget.toFixed(2)}
                  </span>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentUsed}%` }}
                    transition={{ delay: 0.3, duration: 0.8 }}
                    className="h-full bg-gradient-to-r from-secondary to-secondary/80"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {satsToDisplay(spent, budget)} used
                </p>
              </div>

              {/* Auto-pay Limit */}
              <div className="mt-6 p-4 rounded-xl bg-card border border-border">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="mb-1" style={{ fontWeight: 500 }}>
                      Auto-approve limit
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Claude auto-approves payments under this amount
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl" style={{ fontWeight: 600 }}>
                      ${autoPayLimit.toFixed(2)}
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

              {/* Quick Actions */}
              <div className="flex gap-3 mt-6">
                <Link href="/fund" className="flex-1">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full px-6 py-3 rounded-xl bg-secondary text-secondary-foreground"
                  >
                    Top Up Budget
                  </motion.button>
                </Link>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setIsActive(!isActive)}
                  className="px-6 py-3 rounded-xl border border-border hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <Pause className="w-4 h-4" />
                  {isActive ? "Pause" : "Resume"}
                </motion.button>
              </div>
            </motion.div>

            {/* Activity Feed */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-xl mb-4">Agent Activity</h2>
              <div className="space-y-2">
                {MOCK_ACTIVITIES.map((activity, index) => (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.05 }}
                    className="p-4 rounded-xl bg-card border border-border"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="mb-1">{activity.action}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {activity.timestamp}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs ${
                              activity.status === "auto-approved"
                                ? "bg-success-green/20 text-success-green"
                                : activity.status === "approved"
                                  ? "bg-secondary/20 text-secondary"
                                  : "bg-destructive/20 text-destructive"
                            }`}
                          >
                            {activity.status === "auto-approved" && (
                              <>
                                <Check className="w-3 h-3 inline mr-1" />
                                Auto-approved
                              </>
                            )}
                            {activity.status === "approved" && (
                              <>
                                <Check className="w-3 h-3 inline mr-1" />
                                Approved
                              </>
                            )}
                            {activity.status === "denied" && (
                              <>
                                <X className="w-3 h-3 inline mr-1" />
                                Denied
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg" style={{ fontWeight: 500 }}>
                          ${activity.amount.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Danger Zone */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="p-6 rounded-2xl bg-destructive/5 border border-destructive/30"
            >
              <h3 className="text-destructive mb-4" style={{ fontWeight: 500 }}>
                Danger Zone
              </h3>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  // TODO: Call api.agent.pause() to revoke macaroon
                  setIsPaired(false);
                }}
                className="px-6 py-3 rounded-xl border border-destructive text-destructive hover:bg-destructive hover:text-white transition-colors flex items-center gap-2"
              >
                <Power className="w-4 h-4" />
                Disconnect Agent
              </motion.button>
            </motion.div>
          </div>
        ) : (
          /* Pairing Screen */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-8 rounded-2xl bg-card border border-border text-center space-y-6 max-w-lg mx-auto"
          >
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-secondary to-secondary/50 flex items-center justify-center mx-auto">
              <Bot className="w-10 h-10 text-white" />
            </div>

            <div>
              <h2 className="text-2xl mb-2">Connect Claude</h2>
              <p className="text-muted-foreground">
                Set up your AI agent to handle payments on your behalf
              </p>
            </div>

            <PairingQR onConfirm={() => setIsPaired(true)} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
