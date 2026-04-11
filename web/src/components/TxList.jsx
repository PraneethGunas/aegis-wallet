"use client";

import { ArrowUpRight, ArrowDownLeft, ArrowRightLeft, Bot } from "lucide-react";
import { motion } from "motion/react";

const iconMap = {
  receive: { icon: ArrowDownLeft, className: "text-success-green" },
  send: { icon: ArrowUpRight, className: "text-muted-foreground" },
  transfer: { icon: ArrowRightLeft, className: "text-primary" },
  agent: { icon: Bot, className: "text-secondary" },
};

export default function TxList({ transactions = [] }) {
  if (transactions.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No transactions yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map((tx, index) => {
        const { icon: Icon, className: iconClass } = iconMap[tx.type] || iconMap.send;
        return (
          <motion.div
            key={tx.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + index * 0.05 }}
            className="p-4 rounded-xl bg-card border border-border hover:bg-muted transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    tx.isAgent ? "bg-secondary/20" : "bg-muted"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${iconClass}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p>{tx.description}</p>
                    {tx.isAgent && (
                      <span className="px-2 py-0.5 rounded-full bg-secondary/20 text-secondary text-xs">
                        Agent
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{tx.timestamp}</p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className={`text-lg ${tx.amount > 0 ? "text-success-green" : ""}`}
                  style={{ fontWeight: 500 }}
                >
                  {tx.amount > 0 ? "+" : ""}${Math.abs(tx.amount).toFixed(2)}
                </p>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
