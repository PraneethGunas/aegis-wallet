"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Check, X, Pause, Play, Power, ArrowLeft, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import PairingQR from "@/components/PairingQR";
import { useWallet } from "@/lib/store";
import * as api from "@/lib/api";

export default function AgentPage() {
  const {
    agent,
    btcPrice,
    fetchAgentStatus,
    pauseAgent,
    resumeAgent,
    transactions,
    fetchTransactions,
  } = useWallet();

  const [autoPayLimit, setAutoPayLimit] = useState(2.5);
  const [savingLimit, setSavingLimit] = useState(false);
  const [pairingConfig, setPairingConfig] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchAgentStatus();
    fetchTransactions();
  }, [fetchAgentStatus, fetchTransactions]);

  // Sync slider with agent state
  useEffect(() => {
    if (agent.autoPayLimitSats > 0) {
      setAutoPayLimit((agent.autoPayLimitSats / 100_000_000) * btcPrice);
    }
  }, [agent.autoPayLimitSats, btcPrice]);

  const budget = (agent.budgetSats / 100_000_000) * btcPrice;
  const spent = (agent.spentSats / 100_000_000) * btcPrice;
  const percentUsed = budget > 0 ? (spent / budget) * 100 : 0;

  const agentActivities = transactions
    .filter((tx) => tx.isAgent)
    .slice(0, 10);

  const handleAutoPayChange = async (value) => {
    setAutoPayLimit(value);
    // Debounced save
    setSavingLimit(true);
    try {
      const limitSats = Math.round((value / btcPrice) * 100_000_000);
      await api.agent.updateAutoPayLimit(limitSats);
    } catch {
      // Will retry on next change
    } finally {
      setSavingLimit(false);
    }
  };

  const handleCreateAgent = async () => {
    setCreating(true);
    try {
      // Create agent with default budget
      await api.agent.create(50000, 250);
      // Get pairing config
      const config = await api.agent.pair();
      setPairingConfig(config);
      fetchAgentStatus();
    } catch (err) {
      // Error handling
    } finally {
      setCreating(false);
    }
  };

  const handleDisconnect = async () => {
    await pauseAgent();
    fetchAgentStatus();
  };

  const satsDisplay = (usdVal) => {
    const sats = Math.round((usdVal / btcPrice) * 100_000_000);
    return sats.toLocaleString();
  };

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

        {agent.isPaired ? (
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
                          agent.isActive
                            ? "bg-success-green animate-pulse"
                            : "bg-amber-500"
                        }`}
                      />
                      <span className="text-muted-foreground">
                        {agent.isActive ? "Active" : "Paused"}
                      </span>
                    </div>
                    {agent.connectedSince && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Connected since {new Date(agent.connectedSince).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    )}
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
                    animate={{ width: `${Math.min(percentUsed, 100)}%` }}
                    transition={{ delay: 0.3, duration: 0.8 }}
                    className="h-full bg-gradient-to-r from-secondary to-secondary/80"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {satsDisplay(spent)} / {satsDisplay(budget)} sats used
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
                    {savingLimit && (
                      <p className="text-xs text-muted-foreground">Saving...</p>
                    )}
                  </div>
                </div>
                <input
                  type="range"
                  min="0.50"
                  max="50.00"
                  step="0.50"
                  value={autoPayLimit}
                  onChange={(e) => handleAutoPayChange(parseFloat(e.target.value))}
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
                  onClick={() => agent.isActive ? pauseAgent() : resumeAgent()}
                  className="px-6 py-3 rounded-xl border border-border hover:bg-muted transition-colors flex items-center gap-2"
                >
                  {agent.isActive ? (
                    <>
                      <Pause className="w-4 h-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Resume
                    </>
                  )}
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
              {agentActivities.length === 0 ? (
                <div className="p-8 rounded-xl bg-card border border-border text-center text-muted-foreground">
                  No agent activity yet
                </div>
              ) : (
                <div className="space-y-2">
                  {agentActivities.map((activity, index) => (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + index * 0.05 }}
                      className="p-4 rounded-xl bg-card border border-border"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="mb-1">{activity.description}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              {activity.timestamp}
                            </span>
                            {activity.approvalType && (
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs ${
                                  activity.approvalType === "auto"
                                    ? "bg-success-green/20 text-success-green"
                                    : activity.approvalType === "approved"
                                      ? "bg-secondary/20 text-secondary"
                                      : "bg-destructive/20 text-destructive"
                                }`}
                              >
                                {activity.approvalType === "auto" && (
                                  <>
                                    <Check className="w-3 h-3 inline mr-1" />
                                    Auto-approved
                                  </>
                                )}
                                {activity.approvalType === "approved" && (
                                  <>
                                    <Check className="w-3 h-3 inline mr-1" />
                                    Approved
                                  </>
                                )}
                                {activity.approvalType === "denied" && (
                                  <>
                                    <X className="w-3 h-3 inline mr-1" />
                                    Denied
                                  </>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg" style={{ fontWeight: 500 }}>
                            ${Math.abs(activity.amount).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
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
                onClick={handleDisconnect}
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

            {pairingConfig ? (
              <PairingQR
                configString={pairingConfig.configString || JSON.stringify(pairingConfig)}
                onConfirm={() => fetchAgentStatus()}
              />
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleCreateAgent}
                disabled={creating}
                className="px-8 py-4 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center gap-2 mx-auto disabled:opacity-70"
              >
                {creating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Bot className="w-5 h-5" />
                )}
                {creating ? "Setting up..." : "Create Agent Account"}
              </motion.button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
