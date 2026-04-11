"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowUpRight, ArrowDownLeft, ArrowRightLeft, Bot } from "lucide-react";
import { motion } from "motion/react";
import Balance from "@/components/Balance";
import TxList from "@/components/TxList";
import AgentBudget from "@/components/AgentBudget";
import { useWallet } from "@/lib/store";

export default function Dashboard() {
  const {
    balance,
    btcPrice,
    transactions,
    agent,
    fetchBalance,
    fetchTransactions,
    fetchAgentStatus,
  } = useWallet();

  useEffect(() => {
    fetchBalance();
    fetchTransactions();
    fetchAgentStatus();
  }, [fetchBalance, fetchTransactions, fetchAgentStatus]);

  const agentSpentUsd = (agent.spentSats / 100_000_000) * btcPrice;
  const agentBudgetUsd = (agent.budgetSats / 100_000_000) * btcPrice;
  const autoPayLimitUsd = (agent.autoPayLimitSats / 100_000_000) * btcPrice;

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 md:py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl md:text-4xl mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your Bitcoin and agent spending
          </p>
        </motion.div>

        {/* Balance */}
        <div className="mb-8">
          <Balance
            totalUSD={balance.totalUsd}
            totalBTC={balance.totalBtc}
            fundingUSD={balance.l1Usd}
            fundingBTC={balance.l1Sats / 100_000_000}
            agentUSD={balance.l2Usd}
            agentSats={balance.l2Sats}
          />
        </div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-3 gap-4 mb-12"
        >
          {[
            { icon: ArrowUpRight, label: "Send", path: "/send", color: "primary" },
            { icon: ArrowDownLeft, label: "Receive", path: "/receive", color: "primary" },
            { icon: ArrowRightLeft, label: "Fund Agent", path: "/fund", color: "secondary" },
          ].map((action, index) => (
            <Link key={action.label} href={action.path}>
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-full p-4 rounded-xl border border-border hover:bg-muted transition-colors flex flex-col items-center gap-2"
              >
                <action.icon
                  className={`w-5 h-5 ${
                    action.color === "secondary" ? "text-secondary" : "text-primary"
                  }`}
                />
                <span className="text-sm">{action.label}</span>
              </motion.button>
            </Link>
          ))}
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <h2 className="text-xl mb-4">Recent Activity</h2>
          <TxList transactions={transactions} />
        </motion.div>
      </div>

      {/* Agent Status Widget — Desktop */}
      {agent.isPaired && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8 }}
          className="hidden xl:block fixed right-8 top-24 w-80 p-6 rounded-2xl bg-card backdrop-blur-xl border border-border"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-secondary to-secondary/50 flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg">Claude</h3>
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    agent.isActive
                      ? "bg-success-green animate-pulse"
                      : "bg-amber-500"
                  }`}
                />
                <span className="text-sm text-muted-foreground">
                  {agent.isActive ? "Active" : "Paused"}
                </span>
              </div>
            </div>
          </div>

          <AgentBudget
            spent={agentSpentUsd}
            budget={agentBudgetUsd}
            autoPayLimit={autoPayLimitUsd}
          />

          <Link href="/agent" className="block mt-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full px-4 py-3 rounded-xl border border-border hover:bg-muted transition-colors text-sm"
            >
              Manage Agent
            </motion.button>
          </Link>
        </motion.div>
      )}
    </div>
  );
}
