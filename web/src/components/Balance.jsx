"use client";

import Link from "next/link";
import { motion } from "motion/react";

export default function Balance({
  totalUSD = 0,
  totalBTC = 0,
  fundingUSD = 0,
  fundingBTC = 0,
  agentUSD = 0,
  agentSats = 0,
}) {
  return (
    <div>
      {/* Total Balance Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-6 p-8 rounded-3xl bg-gradient-to-br from-card via-card to-muted backdrop-blur-xl border border-border"
      >
        <p className="text-muted-foreground mb-2">Total Balance</p>
        <div className="flex items-baseline gap-4">
          <motion.h2
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-5xl md:text-6xl"
            style={{ fontWeight: 600 }}
          >
            ${totalUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </motion.h2>
          <span className="text-lg text-muted-foreground">
            {totalBTC.toFixed(5)} BTC
          </span>
        </div>
      </motion.div>

      {/* Wallet Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Funding Wallet (L1) */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.02 }}
          className="group relative p-6 rounded-2xl bg-card backdrop-blur-xl border border-border overflow-hidden cursor-pointer transition-all hover:border-primary/50"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg">Funding Wallet</h3>
              <div className="w-3 h-3 rounded-full bg-primary" />
            </div>
            <p className="text-sm text-muted-foreground mb-4">Your savings</p>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl" style={{ fontWeight: 600 }}>
                ${fundingUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-sm text-muted-foreground">
                {fundingBTC.toFixed(5)} BTC
              </span>
            </div>
          </div>
        </motion.div>

        {/* Agent Wallet (L2) */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          whileHover={{ scale: 1.02 }}
          className="group relative p-6 rounded-2xl bg-card backdrop-blur-xl border border-border overflow-hidden cursor-pointer transition-all hover:border-secondary/50"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-secondary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg">Agent Wallet</h3>
              <div className="w-3 h-3 rounded-full bg-secondary" />
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Claude&apos;s spending budget
            </p>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-3xl" style={{ fontWeight: 600 }}>
                ${agentUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-sm text-muted-foreground">
                {agentSats.toLocaleString()} sats
              </span>
            </div>
            <Link href="/fund">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-full px-4 py-2 rounded-xl bg-secondary text-secondary-foreground text-sm"
              >
                Fund Agent
              </motion.button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
