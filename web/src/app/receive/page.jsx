"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Copy, Check, Share2, ArrowLeft, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { useWallet } from "@/lib/store";
import * as api from "@/lib/api";

export default function ReceivePage() {
  const { fundingAddress } = useWallet();
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("funding"); // "funding" | "lightning"

  // Lightning invoice state
  const [lnAmount, setLnAmount] = useState("");
  const [lnMemo, setLnMemo] = useState("");
  const [lnInvoice, setLnInvoice] = useState(null);
  const [lnLoading, setLnLoading] = useState(false);
  const [lnError, setLnError] = useState(null);
  const [lnCopied, setLnCopied] = useState(false);

  const displayAddress = tab === "funding" ? (fundingAddress || "Authenticate to view address") : "";

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    if (tab === "funding") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setLnCopied(true);
      setTimeout(() => setLnCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "My Bitcoin Address",
          text: tab === "funding" ? fundingAddress : lnInvoice?.bolt11,
        });
      } catch {
        // Share cancelled
      }
    }
  };

  const handleGenerateInvoice = async (e) => {
    e.preventDefault();
    setLnLoading(true);
    setLnError(null);
    try {
      const amountSats = Math.round(parseFloat(lnAmount));
      const result = await api.wallet.receive("lightning", {
        amountSats,
        memo: lnMemo || undefined,
      });
      setLnInvoice(result);
    } catch (err) {
      setLnError(err.message);
    } finally {
      setLnLoading(false);
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
          <h1 className="text-3xl md:text-4xl mb-2">Receive Bitcoin</h1>
          <p className="text-muted-foreground">Fund your wallet</p>
        </motion.div>

        {/* Tab Selector */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab("funding")}
            className={`flex-1 px-4 py-3 rounded-xl text-sm transition-all ${
              tab === "funding"
                ? "bg-primary/10 border border-primary text-foreground"
                : "bg-card border border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            Funding Address (L1)
          </button>
          <button
            onClick={() => setTab("lightning")}
            className={`flex-1 px-4 py-3 rounded-xl text-sm transition-all ${
              tab === "lightning"
                ? "bg-secondary/10 border border-secondary text-foreground"
                : "bg-card border border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            Lightning Invoice (L2)
          </button>
        </div>

        {tab === "funding" ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="p-8 rounded-3xl bg-card border border-border text-center space-y-6"
          >
            <p className="text-muted-foreground">
              Send Bitcoin to this Taproot address
            </p>

            {/* QR Code */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="inline-block p-6 rounded-2xl bg-white"
            >
              {fundingAddress ? (
                <QRCodeSVG
                  value={`bitcoin:${fundingAddress}`}
                  size={256}
                  level="M"
                  includeMargin={false}
                />
              ) : (
                <div className="w-64 h-64 flex items-center justify-center text-gray-400">
                  <p className="text-sm">Authenticate to generate QR</p>
                </div>
              )}
            </motion.div>

            <div className="p-4 rounded-xl bg-muted/50 border border-border">
              <p className="text-sm text-muted-foreground mb-2">
                Taproot Address (bc1p...)
              </p>
              <p
                className="break-all text-foreground"
                style={{ fontWeight: 500 }}
              >
                {fundingAddress || "—"}
              </p>
            </div>

            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleCopy(fundingAddress)}
                disabled={!fundingAddress}
                className="flex-1 px-6 py-3 rounded-xl bg-primary text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    <span>Copy Address</span>
                  </>
                )}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleShare}
                disabled={!fundingAddress}
                className="px-6 py-3 rounded-xl border border-border hover:bg-muted transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Share2 className="w-5 h-5" />
                <span>Share</span>
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-8 rounded-3xl bg-card border border-border space-y-6"
          >
            {!lnInvoice ? (
              <>
                <p className="text-center text-muted-foreground">
                  Create a Lightning invoice to receive instantly
                </p>

                {lnError && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                    {lnError}
                  </div>
                )}

                <form onSubmit={handleGenerateInvoice} className="space-y-4">
                  <div>
                    <label className="block mb-2 text-sm">Amount (sats)</label>
                    <input
                      type="number"
                      value={lnAmount}
                      onChange={(e) => setLnAmount(e.target.value)}
                      placeholder="1000"
                      min="1"
                      required
                      className="w-full px-4 py-3 rounded-xl bg-input border border-border focus:border-secondary focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block mb-2 text-sm">Memo (optional)</label>
                    <input
                      type="text"
                      value={lnMemo}
                      onChange={(e) => setLnMemo(e.target.value)}
                      placeholder="What is this for?"
                      className="w-full px-4 py-3 rounded-xl bg-input border border-border focus:border-secondary focus:outline-none transition-colors"
                    />
                  </div>
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={!lnAmount || lnLoading}
                    className="w-full px-6 py-3 rounded-xl bg-secondary text-secondary-foreground disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {lnLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {lnLoading ? "Generating..." : "Generate Invoice"}
                  </motion.button>
                </form>
              </>
            ) : (
              <div className="text-center space-y-6">
                <p className="text-muted-foreground">
                  Share this invoice to receive {lnInvoice.amountSats?.toLocaleString() || lnAmount} sats
                </p>

                <div className="inline-block p-6 rounded-2xl bg-white">
                  <QRCodeSVG
                    value={lnInvoice.bolt11}
                    size={256}
                    level="M"
                    includeMargin={false}
                  />
                </div>

                <div className="p-4 rounded-xl bg-muted/50 border border-border">
                  <p className="text-sm text-muted-foreground mb-2">Lightning Invoice</p>
                  <p className="break-all text-xs text-foreground font-mono">
                    {lnInvoice.bolt11}
                  </p>
                </div>

                <div className="flex gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleCopy(lnInvoice.bolt11)}
                    className="flex-1 px-6 py-3 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center gap-2"
                  >
                    {lnCopied ? (
                      <>
                        <Check className="w-5 h-5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-5 h-5" />
                        <span>Copy Invoice</span>
                      </>
                    )}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setLnInvoice(null);
                      setLnAmount("");
                      setLnMemo("");
                    }}
                    className="px-6 py-3 rounded-xl border border-border hover:bg-muted transition-colors"
                  >
                    New Invoice
                  </motion.button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-6 p-4 rounded-xl bg-muted/30 border border-border"
        >
          <p className="text-sm text-muted-foreground">
            {tab === "funding"
              ? "This address only receives Bitcoin. Funds will appear in your Funding Wallet after network confirmation."
              : "Lightning payments are instant. Funds go directly to your Agent Wallet (L2)."}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
