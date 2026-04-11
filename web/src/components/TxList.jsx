"use client";

import { ArrowUpRight, ArrowDownLeft, ArrowRightLeft, Bot, ExternalLink } from "lucide-react";
import { motion } from "motion/react";

const MEMPOOL_URL = "https://mempool.space";

const iconMap = {
  receive: { icon: ArrowDownLeft, color: "text-success-green" },
  send: { icon: ArrowUpRight, color: "text-muted-foreground" },
  transfer: { icon: ArrowRightLeft, color: "text-primary" },
  agent: { icon: Bot, color: "text-secondary" },
};

export default function TxList({ transactions = [] }) {
  if (transactions.length === 0) return null;

  return (
    <div className="divide-y divide-border/50">
      {transactions.map((tx, i) => {
        const { icon: Icon, color } = iconMap[tx.type] || iconMap.send;
        return (
          <motion.div
            key={tx.id || i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-center justify-between py-3.5 group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-8 h-8 rounded-lg ${tx.isAgent ? "bg-secondary/10" : "bg-muted"} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm truncate">{tx.description}</p>
                  {tx.isAgent && (
                    <span className="pill bg-secondary/10 text-secondary">claude</span>
                  )}
                  {tx.approvalType === "auto" && (
                    <span className="pill bg-success-green/10 text-success-green">auto</span>
                  )}
                  {tx.approvalType === "manual" && (
                    <span className="pill bg-secondary/10 text-secondary">approved</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-muted-foreground">{tx.timestamp}</p>
                  {tx.txid && (
                    <a
                      href={`${MEMPOOL_URL}/tx/${tx.txid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ExternalLink className="w-2.5 h-2.5 text-muted-foreground hover:text-foreground" />
                    </a>
                  )}
                </div>
              </div>
            </div>
            <p className={`font-mono text-sm flex-shrink-0 ${tx.amount > 0 ? "text-success-green" : "text-foreground"}`}
               style={{ fontWeight: 500 }}>
              {tx.amount > 0 ? "+" : "-"}${Math.abs(tx.amount).toFixed(2)}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}
