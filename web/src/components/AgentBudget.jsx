"use client";

import { motion } from "motion/react";

export default function AgentBudget({
  spent = 0,
  budget = 0,
  autoPayLimit = 0,
}) {
  const percentUsed = budget > 0 ? (spent / budget) * 100 : 0;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Budget Used</span>
          <span className="text-sm">
            ${spent.toFixed(2)} / ${budget.toFixed(2)}
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentUsed}%` }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="h-full bg-gradient-to-r from-secondary to-secondary/80"
          />
        </div>
      </div>

      <div className="p-3 rounded-xl bg-muted/50">
        <p className="text-sm text-muted-foreground mb-1">Auto-approve limit</p>
        <p className="text-lg" style={{ fontWeight: 500 }}>
          Under ${autoPayLimit.toFixed(2)}
        </p>
      </div>
    </div>
  );
}
