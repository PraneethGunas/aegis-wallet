"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, Loader2, Copy, Check, ArrowRight, Building2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { useWallet } from "@/lib/store";
import { hasExistingWallet } from "@/lib/passkey";

export default function Onboarding() {
  const router = useRouter();
  const { createWallet, authenticate, fundingAddress, error } = useWallet();
  const [loading, setLoading] = useState(null);
  const [walletExists, setWalletExists] = useState(false);
  const [step, setStep] = useState("welcome"); // "welcome" | "fund"
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setWalletExists(hasExistingWallet());
  }, []);

  const handleBootstrap = async () => {
    setLoading("create");
    try {
      await createWallet();
      setStep("fund");
    } catch {} finally { setLoading(null); }
  };

  const handleOpenWallet = async () => {
    setLoading("open");
    try {
      await authenticate();
      router.push("/dashboard");
    } catch {} finally { setLoading(null); }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(fundingAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen text-foreground flex items-center justify-center">
      <div className="relative z-10 w-full max-w-md mx-auto px-6 py-20">
        <AnimatePresence mode="wait">
          {step === "welcome" && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="font-mono text-sm text-muted-foreground tracking-widest uppercase mb-6"
              >
                aegis
              </motion.p>

              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="text-3xl md:text-4xl mb-3 tracking-tight leading-tight"
                style={{ fontWeight: 600, letterSpacing: "-0.03em" }}
              >
                Your Bitcoin.
                <br />
                <span className="text-primary">Claude&apos;s spending power.</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-sm text-muted-foreground mb-10 max-w-xs mx-auto leading-relaxed"
              >
                Seedless wallet powered by passkeys. Give Claude a Lightning budget.
              </motion.p>

              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mb-6 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                >
                  {error}
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="space-y-4"
              >
                {walletExists ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    onClick={handleOpenWallet}
                    disabled={!!loading}
                    className="w-full px-7 py-4 rounded-xl bg-primary text-primary-foreground text-[15px] font-medium flex items-center justify-center gap-2.5 disabled:opacity-60 glow-orange"
                  >
                    {loading === "open" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Fingerprint className="w-4 h-4" />
                    )}
                    {loading === "open" ? "Authenticating..." : "Open Wallet"}
                  </motion.button>
                ) : (
                  <>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 400, damping: 17 }}
                      onClick={handleBootstrap}
                      disabled={!!loading}
                      className="w-full px-7 py-4 rounded-xl bg-primary text-primary-foreground text-[15px] font-medium flex items-center justify-center gap-2.5 disabled:opacity-60 glow-orange"
                    >
                      {loading === "create" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Fingerprint className="w-4 h-4" />
                      )}
                      {loading === "create" ? "Creating wallet..." : "Create Wallet"}
                    </motion.button>

                    <button
                      onClick={handleOpenWallet}
                      disabled={!!loading}
                      className="text-[13px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mx-auto"
                    >
                      {loading === "open" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {loading === "open" ? "Authenticating..." : "Open existing wallet"}
                    </button>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}

          {step === "fund" && (
            <motion.div
              key="fund"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="font-mono text-sm text-muted-foreground tracking-widest uppercase mb-6"
              >
                aegis
              </motion.p>

              <motion.h2
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="text-2xl mb-2 tracking-tight"
                style={{ fontWeight: 600, letterSpacing: "-0.02em" }}
              >
                Fund your wallet
              </motion.h2>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
                className="text-sm text-muted-foreground mb-8"
              >
                Send bitcoin to your Taproot address to get started.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="p-5 rounded-xl glass border border-border/50 mb-4"
              >
                <p className="text-sm font-medium mb-4">Fund address</p>
                {fundingAddress ? (
                  <div className="space-y-3">
                    <div className="inline-block p-3 bg-white rounded-xl border border-border/30">
                      <QRCodeSVG value={fundingAddress} size={160} />
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 rounded-lg glass border border-border/50 font-mono text-[11px] break-all text-left">
                        {fundingAddress}
                      </code>
                      <button
                        onClick={handleCopy}
                        className="p-2 rounded-lg glass border border-border/50 flex-shrink-0 hover:bg-muted transition-colors"
                      >
                        {copied ? (
                          <Check className="w-3.5 h-3.5 text-success-green" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      taproot address (bc1p...)
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">
                    Address unavailable
                  </p>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="p-4 rounded-xl glass border border-border/50 mb-8 flex items-center justify-between opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg glass border border-border/50 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">Get from exchange</p>
                    <p className="text-[11px] text-muted-foreground">Coming soon</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.55 }}
              >
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  onClick={() => router.push("/dashboard")}
                  className="w-full px-7 py-4 rounded-xl bg-primary text-primary-foreground text-[15px] font-medium flex items-center justify-center gap-2.5 glow-orange"
                >
                  I&apos;ve funded my wallet
                  <ArrowRight className="w-4 h-4" />
                </motion.button>

                <button
                  onClick={() => router.push("/dashboard")}
                  className="mt-3 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip for now
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
