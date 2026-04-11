"use client";

import Link from "next/link";
import { ArrowUpRight, ArrowDownLeft, ArrowRightLeft, Bot } from "lucide-react";
import { motion } from "motion/react";
import Balance from "@/components/Balance";
import TxList from "@/components/TxList";
import AgentBudget from "@/components/AgentBudget";

// TODO: Replace with real data from API
const MOCK_TRANSACTIONS = [
  { id: 1, type: "receive", description: "Received Bitcoin", amount: 150.0, timestamp: "2 hours ago", isAgent: false },
  { id: 2, type: "agent", description: "coolproject.co domain", amount: -12.99, timestamp: "5 hours ago", isAgent: true },
  { id: 3, type: "transfer", description: "Funded Agent Wallet", amount: -25.0, timestamp: "1 day ago", isAgent: false },
  { id: 4, type: "agent", description: "OpenAI API credits", amount: -8.5, timestamp: "1 day ago", isAgent: true },
  { id: 5, type: "send", description: "Sent to external wallet", amount: -100.0, timestamp: "2 days ago", isAgent: false },
];

export default function Dashboard() {
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
            totalUSD={2845.67}
            totalBTC={0.04523}
            fundingUSD={2650.4}
            fundingBTC={0.04218}
            agentUSD={195.27}
            agentSats={305000}
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
          <TxList transactions={MOCK_TRANSACTIONS} />
        </motion.div>
      </div>

      {/* Agent Status Widget — Desktop */}
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
              <div className="w-2 h-2 rounded-full bg-success-green animate-pulse" />
              <span className="text-sm text-muted-foreground">Active</span>
            </div>
          </div>
        </div>

        <AgentBudget spent={6.2} budget={25.0} autoPayLimit={2.5} />

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
    </div>
  );
}
