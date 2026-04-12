"use client";

import { ArrowUpRight, ArrowDownLeft, ArrowRightLeft, Bot, ExternalLink, Clock } from "lucide-react";
import { motion } from "motion/react";

const MEMPOOL_URL = "https://mempool.space";

const iconMap = {
  receive: { icon: ArrowDownLeft, color: "text-success-green" },
  send: { icon: ArrowUpRight, color: "text-muted-foreground" },
  transfer: { icon: ArrowRightLeft, color: "text-primary" },
  agent: { icon: Bot, color: "text-secondary" },
};

function timeAgo(timestamp) {
  if (!timestamp) return "";
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function TxList({ transactions = [], btcPrice = 100000 }) {
  if (transactions.length === 0) return null;

  return (
    <div className="divide-y divide-border/50">
      {transactions.map((tx, i) => {
        const { icon: Icon, color } = iconMap[tx.type] || iconMap.send;
        const isUnconfirmed = tx.confirmations === 0;

        return (
          <motion.div
            key={tx.id || i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.03 }}
            className={`flex items-center justify-between py-3.5 group ${isUnconfirmed ? "opacity-75" : ""}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                isUnconfirmed
                  ? "bg-amber-500/10 animate-pulse"
                  : tx.isAgent ? "bg-secondary/10" : "bg-muted"
              }`}>
                {isUnconfirmed
                  ? <Clock className="w-4 h-4 text-amber-500" />
                  : <Icon className={`w-4 h-4 ${color}`} />
                }
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm truncate">{tx.description}</p>
                  {isUnconfirmed && (
                    <span className="pill bg-amber-500/15 text-amber-500 animate-pulse">pending</span>
                  )}
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
                  <p className="text-xs text-muted-foreground">{timeAgo(tx.timestamp)}</p>
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
            <div className="text-right flex-shrink-0">
              {(() => {
                const sats = Math.abs(tx.amountSats || tx.amount || 0);
                const usd = (sats / 1e8) * btcPrice;
                const isPositive = (tx.amount || tx.amountSats || 0) > 0 || tx.type === "receive";
                return (
                  <p className={`font-mono text-sm ${
                    isUnconfirmed
                      ? "text-amber-500"
                      : isPositive ? "text-success-green" : "text-foreground"
                  }`} style={{ fontWeight: 500 }}>
                    {isPositive ? "+" : "-"}${usd < 0.01 && usd > 0 ? "<0.01" : usd.toFixed(2)}
                  </p>
                );
              })()}
              {isUnconfirmed && (
                <p className="font-mono text-[10px] text-amber-500/70">unconfirmed</p>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
