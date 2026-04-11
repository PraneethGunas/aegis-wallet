"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fingerprint, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useWallet } from "@/lib/store";
import * as bitcoin from "@/lib/bitcoin";
import * as api from "@/lib/api";

export default function FundAgentPage() {
  const router = useRouter();
  const { balance, btcPrice, fetchBalance, fetchAgentStatus } = useWallet();
  const [amountUSD, setAmountUSD] = useState("");
  const [step, setStep] = useState("form"); // "form" | "funding" | "done"
  const [error, setError] = useState(null);

  const fundingBalanceUsd = balance.l1Usd;
  const agentBalanceUsd = balance.l2Usd;
  const btcEquivalent = amountUSD
    ? (parseFloat(amountUSD) / btcPrice).toFixed(8)
    : "0.00000000";
  const satsEquivalent = amountUSD
    ? Math.round((parseFloat(amountUSD) / btcPrice) * 100_000_000)
    : 0;

  const handleConfirm = async (e) => {
    e.preventDefault();
    setStep("funding");
    setError(null);
    try {
      // 1. Get LND deposit address from backend
      const { address: lndAddress } = await api.ln.getDepositAddress();

      // 2. Get UTXOs
      const { utxos } = await api.wallet.getUtxos();

      // 3. Build PSBT locally
      const psbtHex = bitcoin.createFundLNTransaction(
        null, // uses cached funding key
        lndAddress,
        satsEquivalent,
        utxos,
        5 // standard fee rate
      );

      // 4. Sign PSBT locally
      const signedTxHex = bitcoin.signTransaction(psbtHex);

      // 5. Send signed tx to backend for broadcast
      await api.ln.fund(signedTxHex);

      setStep("done");

      // Refresh data
      fetchBalance();
      fetchAgentStatus();

      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (err) {
      setError(err.message);
      setStep("form");
    }
  };

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <div className="max-w-2xl mx-auto px-6 md:px-8 py-8 md:py-12">
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
          <h1 className="text-3xl md:text-4xl mb-2">Fund Agent Wallet</h1>
          <p className="text-muted-foreground">
            Set Claude&apos;s spending budget
          </p>
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm"
          >
            {error}
          </motion.div>
        )}

        {step === "done" ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-12 rounded-3xl bg-card border border-success-green/30 text-center space-y-4"
          >
            <div className="w-20 h-20 rounded-full bg-success-green/20 flex items-center justify-center mx-auto">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2 }}
                className="text-success-green text-4xl"
              >
                ✓
              </motion.div>
            </div>
            <h2 className="text-2xl">Agent Funded</h2>
            <p className="text-muted-foreground">
              ${parseFloat(amountUSD).toFixed(2)} transferred to Agent Wallet
            </p>
          </motion.div>
        ) : (
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onSubmit={handleConfirm}
            className="space-y-6"
          >
            <div className="p-6 rounded-2xl bg-gradient-to-br from-secondary/10 to-transparent border border-secondary/30">
              <h3 className="mb-2" style={{ fontWeight: 500 }}>
                How it works
              </h3>
              <p className="text-sm text-muted-foreground">
                Move funds from your Funding Wallet to the Agent Wallet. Claude can
                only spend from the Agent Wallet, giving you full control over the
                budget.
              </p>
            </div>

            {/* Balance Flow */}
            <div className="grid md:grid-cols-3 gap-4 items-center">
              <div className="p-4 rounded-xl bg-card border border-border">
                <p className="text-sm text-muted-foreground mb-1">
                  Funding Wallet
                </p>
                <p className="text-2xl" style={{ fontWeight: 600 }}>
                  ${fundingBalanceUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-xs text-muted-foreground">
                    Your savings
                  </span>
                </div>
              </div>

              <div className="flex justify-center">
                <ArrowRight className="w-6 h-6 text-muted-foreground" />
              </div>

              <div className="p-4 rounded-xl bg-card border border-border">
                <p className="text-sm text-muted-foreground mb-1">Agent Wallet</p>
                <p className="text-2xl" style={{ fontWeight: 600 }}>
                  ${agentBalanceUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <div className="w-2 h-2 rounded-full bg-secondary" />
                  <span className="text-xs text-muted-foreground">
                    Claude&apos;s budget
                  </span>
                </div>
              </div>
            </div>

            {/* Amount Input */}
            <div>
              <label className="block mb-2">Amount to Transfer</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">
                  $
                </span>
                <input
                  type="number"
                  value={amountUSD}
                  onChange={(e) => setAmountUSD(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  max={fundingBalanceUsd}
                  required
                  className="w-full pl-8 pr-4 py-4 rounded-xl bg-input border border-border focus:border-secondary focus:outline-none transition-colors text-lg"
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-sm text-muted-foreground">
                <span>
                  &asymp; {btcEquivalent} BTC ({satsEquivalent.toLocaleString()}{" "}
                  sats)
                </span>
                {parseFloat(amountUSD) > fundingBalanceUsd && (
                  <span className="text-destructive">Insufficient balance</span>
                )}
              </div>
            </div>

            {/* Quick Amounts */}
            <div className="grid grid-cols-4 gap-3">
              {[10, 25, 50, 100].map((amount) => (
                <motion.button
                  key={amount}
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setAmountUSD(amount.toString())}
                  className="px-4 py-3 rounded-xl border border-border hover:bg-muted transition-colors text-sm"
                >
                  ${amount}
                </motion.button>
              ))}
            </div>

            {/* Preview */}
            {amountUSD &&
              parseFloat(amountUSD) > 0 &&
              parseFloat(amountUSD) <= fundingBalanceUsd && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="p-6 rounded-2xl bg-muted/50 border border-border space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      New Funding Balance
                    </span>
                    <span style={{ fontWeight: 500 }}>
                      ${(fundingBalanceUsd - parseFloat(amountUSD)).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      New Agent Balance
                    </span>
                    <span className="text-secondary" style={{ fontWeight: 500 }}>
                      ${(agentBalanceUsd + parseFloat(amountUSD)).toFixed(2)}
                    </span>
                  </div>
                </motion.div>
              )}

            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={
                step === "funding" ||
                !amountUSD ||
                parseFloat(amountUSD) <= 0 ||
                parseFloat(amountUSD) > fundingBalanceUsd
              }
              className="w-full px-6 py-4 rounded-xl bg-secondary text-secondary-foreground disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg"
            >
              {step === "funding" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Fingerprint className="w-5 h-5" />
                </motion.div>
              )}
              {step === "funding" ? "Signing & Broadcasting..." : "Confirm with Passkey"}
            </motion.button>
          </motion.form>
        )}
      </div>
    </div>
  );
}
