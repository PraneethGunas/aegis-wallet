"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, Share2, ArrowLeft } from "lucide-react";
import { motion } from "motion/react";

export default function ReceivePage() {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("funding"); // "funding" | "lightning"

  // TODO: Get real addresses from API
  const fundingAddress = "bc1p...your-taproot-address";
  const displayAddress = tab === "funding" ? fundingAddress : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(displayAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "My Bitcoin Address", text: displayAddress });
      } catch {
        // Share cancelled
      }
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

            {/* QR Code Placeholder — replace with real QR generation */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="inline-block p-8 rounded-2xl bg-white"
            >
              <svg
                width="256"
                height="256"
                viewBox="0 0 256 256"
                className="max-w-full h-auto"
              >
                <rect width="256" height="256" fill="white" />
                <g fill="black">
                  <rect x="20" y="20" width="60" height="60" />
                  <rect x="30" y="30" width="40" height="40" fill="white" />
                  <rect x="40" y="40" width="20" height="20" />
                  <rect x="176" y="20" width="60" height="60" />
                  <rect x="186" y="30" width="40" height="40" fill="white" />
                  <rect x="196" y="40" width="20" height="20" />
                  <rect x="20" y="176" width="60" height="60" />
                  <rect x="30" y="186" width="40" height="40" fill="white" />
                  <rect x="40" y="196" width="20" height="20" />
                  {Array.from({ length: 15 }).map((_, i) =>
                    Array.from({ length: 15 }).map((_, j) => {
                      const shouldFill =
                        (i + j) % 3 === 0 || (i * j) % 5 === 0;
                      return shouldFill ? (
                        <rect
                          key={`${i}-${j}`}
                          x={90 + i * 10}
                          y={90 + j * 10}
                          width="8"
                          height="8"
                        />
                      ) : null;
                    })
                  )}
                </g>
              </svg>
            </motion.div>

            <div className="p-4 rounded-xl bg-muted/50 border border-border">
              <p className="text-sm text-muted-foreground mb-2">
                Taproot Address (bc1p...)
              </p>
              <p
                className="break-all text-foreground"
                style={{ fontWeight: 500 }}
              >
                {fundingAddress}
              </p>
            </div>

            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleCopy}
                className="flex-1 px-6 py-3 rounded-xl bg-primary text-primary-foreground flex items-center justify-center gap-2"
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
                className="px-6 py-3 rounded-xl border border-border hover:bg-muted transition-colors flex items-center gap-2"
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
            className="p-8 rounded-3xl bg-card border border-border text-center space-y-6"
          >
            <p className="text-muted-foreground">
              Create a Lightning invoice to receive instantly
            </p>
            {/* TODO: Amount input + memo + generate invoice via API */}
            <div className="p-6 rounded-xl bg-muted/30 border border-border">
              <p className="text-muted-foreground text-sm">
                Lightning invoice generation coming soon
              </p>
            </div>
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
