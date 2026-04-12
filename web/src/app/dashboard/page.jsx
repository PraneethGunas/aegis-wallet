"use client";

import { useEffect, useState } from "react";
import {
  Bot, Wallet, Zap, Plus, ArrowRightLeft, Pause, Play,
  Fingerprint, Loader2, ChevronDown, Copy, RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import TxList from "@/components/TxList";
import FundingFlow from "@/components/FundingFlow";
import FundAgentFlow from "@/components/FundAgentFlow";
import AgentSetup from "@/components/AgentSetup";
import ApprovalBanner from "@/components/ApprovalBanner";
import { useWallet } from "@/lib/store";
import * as api from "@/lib/api";

const spring = { type: "spring", stiffness: 300, damping: 24 };

export default function Dashboard() {
  const {
    balance, btcPrice, transactions, agent, fundingAddress, loading, credentialId,
    pendingApproval, fetchBalance, fetchTransactions, fetchAgentStatus,
    approveRequest, denyRequest, pauseAgent, resumeAgent,
  } = useWallet();

  const [showFunding, setShowFunding] = useState(false);
  const [showFundAgent, setShowFundAgent] = useState(false);
  const [fundTab, setFundTab] = useState("transfer"); // "transfer" | "lightning"
  const [fundAmount, setFundAmount] = useState("");
  const [funding, setFunding] = useState(false);
  const [lnAmount, setLnAmount] = useState("");
  const [lnInvoice, setLnInvoice] = useState(null);
  const [lnLoading, setLnLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchBalance();
    fetchTransactions();
    fetchAgentStatus();
  }, [fetchBalance, fetchTransactions, fetchAgentStatus]);

  const spentUsd = ((agent.spentSats || 0) / 1e8) * btcPrice;
  const budgetUsd = ((agent.budgetSats || 0) / 1e8) * btcPrice;
  const budgetPct = budgetUsd > 0 ? Math.min(100, (spentUsd / budgetUsd) * 100) : 0;

  const handleFundAgent = async () => {
    if (!fundAmount) return;
    setFunding(true);
    try {
      const bitcoin = await import("@/lib/bitcoin");
      const { address } = await api.ln.getDepositAddress();
      const { utxos } = await api.wallet.getUtxos();
      const sats = Math.round((parseFloat(fundAmount) / btcPrice) * 1e8);
      const psbtHex = bitcoin.createFundLNTransaction(null, address, sats, utxos, 5);
      const signedTxHex = bitcoin.signTransaction(psbtHex);
      await api.ln.fund(signedTxHex);
      setShowFundAgent(false);
      setFundAmount("");
      fetchBalance();
    } catch {}
    setFunding(false);
  };

  const handleGenerateLnInvoice = async (e) => {
    e.preventDefault();
    setLnLoading(true);
    try {
      const result = await api.wallet.receive("lightning", {
        amountSats: parseInt(lnAmount),
        memo: "Aegis agent budget deposit",
      });
      setLnInvoice(result);
    } catch {}
    setLnLoading(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    await Promise.all([fetchBalance(), fetchTransactions(), fetchAgentStatus()]);
    setSyncing(false);
  };

  // Auto-poll balance every 30s
  useEffect(() => {
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [fetchBalance]);


  return (
    <div className="min-h-screen pb-28 md:pb-8">
      {/* Approval banner — top priority */}
      <ApprovalBanner
        approval={pendingApproval}
        btcPrice={btcPrice}
        onApprove={() => approveRequest(pendingApproval?.approvalId)}
        onDeny={() => denyRequest(pendingApproval?.approvalId)}
      />

      <div className="max-w-2xl mx-auto px-6 md:px-10 pt-10 md:pt-14">
        {/* Wordmark */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-10"
        >
          aegis
        </motion.p>

        {/* ── Balance ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.05 }}
          className="mb-10"
        >
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-muted-foreground">Total balance</p>
            <motion.button
              whileTap={{ scale: 0.9, rotate: 180 }}
              transition={spring}
              onClick={handleSync}
              disabled={syncing}
              className="w-7 h-7 rounded-lg glass border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Sync wallet"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            </motion.button>
          </div>
          <p className={`font-mono text-5xl tracking-tight mb-1 transition-opacity ${loading.balance ? "animate-pulse opacity-70" : ""}`} style={{ fontWeight: 600, letterSpacing: "-0.04em" }}>
            ${balance.totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm text-muted-foreground">
              {(balance.l1Sats + balance.l2Sats).toLocaleString()} sats
            </p>
            {balance.l1Unconfirmed > 0 && (
              <span className="pill bg-amber-500/15 text-amber-500 animate-pulse">
                +{balance.l1Unconfirmed.toLocaleString()} pending
              </span>
            )}
          </div>

          {/* L1 / L2 bar */}
          <div className="flex gap-3 mt-6">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              transition={spring}
              onClick={() => { setShowFunding(!showFunding); setShowFundAgent(false); }}
              className={`flex-1 p-4 rounded-xl border transition-all ${
                showFunding ? "border-primary/30 glass glow-orange" : "border-border/50 glass hover:border-border"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-3.5 h-3.5 text-primary/70" />
                <span className="text-xs text-muted-foreground">Savings</span>
              </div>
              <p className={`font-mono text-lg ${loading.balance ? "animate-pulse opacity-70" : ""}`} style={{ fontWeight: 500 }}>
                ${balance.l1Usd.toFixed(2)}
              </p>
              <div className="flex items-center gap-1.5">
                <p className="font-mono text-xs text-muted-foreground">{balance.l1Sats.toLocaleString()} sats</p>
                {balance.l1Unconfirmed > 0 && (
                  <span className="font-mono text-xs text-amber-500 animate-pulse">
                    +{balance.l1Unconfirmed.toLocaleString()}
                  </span>
                )}
              </div>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              transition={spring}
              onClick={() => { setShowFundAgent(!showFundAgent); setShowFunding(false); }}
              className={`flex-1 p-4 rounded-xl border transition-all ${
                showFundAgent ? "border-secondary/30 glass glow-blue" : "border-border/50 glass hover:border-border"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-3.5 h-3.5 text-secondary/70" />
                <span className="text-xs text-muted-foreground">Agent budget</span>
              </div>
              <p className={`font-mono text-lg ${loading.balance ? "animate-pulse opacity-70" : ""}`} style={{ fontWeight: 500 }}>
                ${balance.l2Usd.toFixed(2)}
              </p>
              <p className="font-mono text-xs text-muted-foreground">{balance.l2Sats.toLocaleString()} sats</p>
            </motion.button>
          </div>

          {/* Inline funding */}
          <FundingFlow isOpen={showFunding} onClose={() => setShowFunding(false)} fundingAddress={fundingAddress} />

          {/* Fund Agent — full pipeline: L1→on-chain→channel→ready */}
          <FundAgentFlow
            isOpen={showFundAgent}
            onClose={() => setShowFundAgent(false)}
            balance={balance}
            btcPrice={btcPrice}
          />

          {/* REMOVED old inline fund agent — replaced by FundAgentFlow */}
          <AnimatePresence>
            {false && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="p-5 rounded-xl glass border border-border/50 mt-3 space-y-4">
                  {/* Tab: Transfer from savings vs Receive Lightning */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setFundTab("transfer")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        fundTab === "transfer" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <ArrowRightLeft className="w-3 h-3" />
                      From savings
                    </button>
                    <button
                      onClick={() => setFundTab("lightning")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        fundTab === "lightning" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Zap className="w-3 h-3" />
                      Receive Lightning
                    </button>
                  </div>

                  {fundTab === "transfer" ? (
                    <>
                      <div className="flex gap-2">
                        {[10, 25, 50].map((usd) => (
                          <button
                            key={usd}
                            onClick={() => setFundAmount(String(usd))}
                            className={`flex-1 py-2 rounded-lg font-mono text-sm transition-colors ${
                              fundAmount === String(usd)
                                ? "bg-secondary/15 text-secondary border border-secondary/30"
                                : "glass border border-border/50 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            ${usd}
                          </button>
                        ))}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
                        <input
                          type="number"
                          value={fundAmount}
                          onChange={(e) => setFundAmount(e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          className="w-full pl-7 pr-4 py-2.5 rounded-lg bg-input border border-border/50 focus:border-secondary/50 focus:outline-none font-mono text-sm"
                        />
                      </div>
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        transition={spring}
                        onClick={handleFundAgent}
                        disabled={!fundAmount || funding}
                        className="w-full py-3 rounded-xl bg-secondary text-white flex items-center justify-center gap-2 disabled:opacity-40 text-sm font-medium"
                      >
                        {funding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                        {funding ? "Signing..." : "Confirm with passkey"}
                      </motion.button>
                    </>
                  ) : (
                    /* Lightning invoice for direct L2 deposit */
                    lnInvoice ? (
                      <div className="text-center space-y-3">
                        <div className="inline-block p-3 bg-white rounded-xl border border-border/30">
                          <QRCodeSVG value={lnInvoice.bolt11} size={160} />
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 px-3 py-2 rounded-lg glass border border-border/50 font-mono text-[10px] break-all text-left max-h-16 overflow-auto">
                            {lnInvoice.bolt11}
                          </code>
                          <button onClick={() => { navigator.clipboard.writeText(lnInvoice.bolt11); }} className="p-2 rounded-lg glass border border-border/50 flex-shrink-0 hover:bg-muted transition-colors">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <button onClick={() => setLnInvoice(null)} className="text-xs text-secondary hover:underline">
                          New invoice
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleGenerateLnInvoice} className="space-y-3">
                        <input
                          type="number"
                          value={lnAmount}
                          onChange={(e) => setLnAmount(e.target.value)}
                          placeholder="Amount (sats)"
                          required min="1"
                          className="w-full px-3 py-2 rounded-lg bg-input border border-border/50 focus:border-secondary/50 focus:outline-none font-mono text-sm"
                        />
                        <button
                          type="submit"
                          disabled={!lnAmount || lnLoading}
                          className="w-full py-2.5 rounded-lg bg-secondary text-white disabled:opacity-40 flex items-center justify-center gap-2 text-sm font-medium"
                        >
                          {lnLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                          Generate invoice
                        </button>
                      </form>
                    )
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Claude Agent ────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.1 }}
          className="mb-10"
        >
          <p className="text-xs text-muted-foreground mb-3">Spending policy</p>

          {!agent.isPaired ? (
            <AgentSetup onPaired={fetchAgentStatus} btcPrice={btcPrice} credentialId={credentialId} />
          ) : (
            <div className="p-5 rounded-xl glass border border-border/50 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center">
                    <Bot className="w-[18px] h-[18px] text-secondary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Claude</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`pill ${
                        agent.isActive
                          ? "bg-success-green/15 text-success-green"
                          : "bg-amber-500/15 text-amber-400"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${agent.isActive ? "bg-success-green" : "bg-amber-500"}`} />
                        {agent.isActive ? "active" : "paused"}
                      </span>
                    </div>
                  </div>
                </div>

                <motion.button
                  whileTap={{ scale: 0.9 }}
                  transition={spring}
                  onClick={agent.isActive ? pauseAgent : resumeAgent}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                    agent.isActive
                      ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                      : "bg-success-green/10 text-success-green hover:bg-success-green/20"
                  }`}
                >
                  {agent.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </motion.button>
              </div>

              {/* Budget bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Budget</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    ${spentUsd.toFixed(2)} / ${budgetUsd.toFixed(2)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden relative">
                  {/* Tick marks */}
                  <div className="absolute inset-0 flex">
                    {[25, 50, 75].map((pct) => (
                      <div key={pct} className="h-full border-r border-background/30" style={{ width: `${pct}%`, position: "absolute", left: `${pct}%` }} />
                    ))}
                  </div>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${budgetPct}%` }}
                    transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
                    className="h-full rounded-full bg-gradient-to-r from-secondary to-secondary/70"
                  />
                </div>
              </div>

              {/* Adjust spending limit */}
              <div className="flex gap-2">
                {[5, 10, 20].map((usd) => {
                  const sats = Math.round((usd / btcPrice) * 1e8);
                  return (
                    <motion.button
                      key={usd}
                      whileTap={{ scale: 0.95 }}
                      onClick={async () => {
                        try {
                          await api.agent.updateBudget(sats);
                          fetchAgentStatus();
                          fetchBalance();
                        } catch {}
                      }}
                      className="flex-1 py-2 rounded-lg glass border border-border/50 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Set ${usd}
                    </motion.button>
                  );
                })}
              </div>

              {/* Revoke */}
              <button
                onClick={async () => {
                  try {
                    await api.agent.revoke();
                    fetchAgentStatus();
                  } catch {}
                }}
                className="text-xs text-destructive/60 hover:text-destructive transition-colors"
              >
                Revoke agent access
              </button>
            </div>
          )}
        </motion.div>

        {/* ── Activity ────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.15 }}
        >
          <p className="text-xs text-muted-foreground mb-3">Activity</p>
          {transactions.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-10 h-10 rounded-lg glass border border-border/50 flex items-center justify-center mx-auto mb-3">
                <Bot className="w-[18px] h-[18px] text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground mb-0.5">No activity yet</p>
              <p className="text-xs text-muted-foreground">
                Ask Claude to buy you a domain to see this in action
              </p>
            </div>
          ) : (
            <TxList transactions={transactions} btcPrice={btcPrice} />
          )}
        </motion.div>
      </div>
    </div>
  );
}
