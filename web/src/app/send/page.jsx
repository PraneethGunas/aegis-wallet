"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fingerprint, ArrowLeft, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useWallet } from "@/lib/store";
import * as bitcoin from "@/lib/bitcoin";
import * as api from "@/lib/api";

const FEES = {
  economy: { time: "~30 min", rate: 1 },
  standard: { time: "~10 min", rate: 5 },
  priority: { time: "~5 min", rate: 15 },
};

export default function SendPage() {
  const router = useRouter();
  const { balance, btcPrice, fetchBalance, fetchTransactions } = useWallet();
  const [address, setAddress] = useState("");
  const [amountUSD, setAmountUSD] = useState("");
  const [fee, setFee] = useState("standard");
  const [step, setStep] = useState("form"); // "form" | "review" | "sending" | "sent"
  const [error, setError] = useState(null);

  const btcEquivalent = amountUSD
    ? (parseFloat(amountUSD) / btcPrice).toFixed(8)
    : "0.00000000";
  const satsAmount = amountUSD
    ? Math.round((parseFloat(amountUSD) / btcPrice) * 100_000_000)
    : 0;
  const feeCostEstimate = FEES[fee].rate * 150 / 100_000_000 * btcPrice; // ~150 vB tx
  const fundingBalanceUsd = balance.l1Usd;

  const handleReview = (e) => {
    e.preventDefault();
    setError(null);
    setStep("review");
  };

  const handleConfirm = async () => {
    setStep("sending");
    setError(null);
    try {
      // 1. Get UTXOs from backend
      const { utxos } = await api.wallet.getUtxos();

      // 2. Build and sign the transaction locally
      const psbtHex = bitcoin.createFundLNTransaction(
        null, // uses cached funding key
        address,
        satsAmount,
        utxos,
        FEES[fee].rate
      );
      const signedTxHex = bitcoin.signTransaction(psbtHex);

      // 3. Broadcast via backend
      await api.wallet.send(signedTxHex);

      setStep("sent");

      // Refresh balances
      fetchBalance();
      fetchTransactions();

      // Navigate back after brief delay
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (err) {
      setError(err.message);
      setStep("review");
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
          <h1 className="text-3xl md:text-4xl mb-2">Send Bitcoin</h1>
          <p className="text-muted-foreground">Send from your Funding Wallet</p>
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

        {step === "sent" ? (
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
            <h2 className="text-2xl">Transaction Sent</h2>
            <p className="text-muted-foreground">
              ${parseFloat(amountUSD).toFixed(2)} sent to {address.slice(0, 12)}...
            </p>
          </motion.div>
        ) : step === "form" ? (
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onSubmit={handleReview}
            className="space-y-6"
          >
            <div className="p-6 rounded-2xl bg-card border border-border">
              <p className="text-sm text-muted-foreground mb-1">
                Available Balance
              </p>
              <p className="text-2xl" style={{ fontWeight: 600 }}>
                ${fundingBalanceUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div>
              <label className="block mb-2">Recipient Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="bc1q... or bc1p..."
                required
                className="w-full px-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block mb-2">Amount</label>
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
                  required
                  className="w-full pl-8 pr-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none transition-colors text-lg"
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                &asymp; {btcEquivalent} BTC ({satsAmount.toLocaleString()} sats)
              </p>
            </div>

            <div>
              <label className="block mb-3">Transaction Speed</label>
              <div className="grid grid-cols-3 gap-3">
                {["economy", "standard", "priority"].map((option) => (
                  <motion.button
                    key={option}
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setFee(option)}
                    className={`p-4 rounded-xl border transition-all ${
                      fee === option
                        ? "bg-primary/10 border-primary text-foreground"
                        : "bg-card border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <p
                      className="text-sm mb-1 capitalize"
                      style={{ fontWeight: 500 }}
                    >
                      {option}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {FEES[option].time}
                    </p>
                    <p className="text-sm mt-2">{FEES[option].rate} sat/vB</p>
                  </motion.button>
                ))}
              </div>
            </div>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={!address || !amountUSD || parseFloat(amountUSD) > fundingBalanceUsd}
              className="w-full px-6 py-4 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed text-lg"
            >
              Review Transaction
            </motion.button>
          </motion.form>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <div className="p-6 rounded-2xl bg-card border border-border space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">To</p>
                <p className="break-all">{address}</p>
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-sm text-muted-foreground mb-1">Amount</p>
                <p className="text-3xl" style={{ fontWeight: 600 }}>
                  ${parseFloat(amountUSD).toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground">
                  &asymp; {btcEquivalent} BTC
                </p>
              </div>
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Network Fee (~{FEES[fee].rate} sat/vB)
                  </span>
                  <span>${feeCostEstimate.toFixed(2)}</span>
                </div>
              </div>
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <span style={{ fontWeight: 500 }}>Total</span>
                  <span className="text-xl" style={{ fontWeight: 600 }}>
                    ${(parseFloat(amountUSD) + feeCostEstimate).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleConfirm}
              disabled={step === "sending"}
              className="w-full px-6 py-4 rounded-xl bg-primary text-primary-foreground flex items-center justify-center gap-3 text-lg disabled:opacity-70"
            >
              {step === "sending" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Fingerprint className="w-5 h-5" />
                </motion.div>
              )}
              {step === "sending" ? "Signing & Broadcasting..." : "Confirm with Passkey"}
            </motion.button>

            <button
              onClick={() => setStep("form")}
              disabled={step === "sending"}
              className="w-full px-6 py-3 rounded-xl border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              Back
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
