"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, Shield, Zap, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useWallet } from "@/lib/store";

export default function Welcome() {
  const router = useRouter();
  const { createWallet, authenticate, error } = useWallet();
  const [loading, setLoading] = useState(null);

  const handleCreateWallet = async () => {
    setLoading("create");
    try {
      await createWallet();
      router.push("/dashboard");
    } catch {} finally { setLoading(null); }
  };

  const handleOpenWallet = async () => {
    setLoading("open");
    try {
      await authenticate();
      router.push("/dashboard");
    } catch {} finally { setLoading(null); }
  };

  return (
    <div className="min-h-screen text-foreground flex items-center">

      <div className="relative z-10 max-w-5xl mx-auto px-8 md:px-16 w-full py-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-xl"
        >
          {/* Wordmark */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="font-mono text-sm text-muted-foreground tracking-widest uppercase mb-10"
          >
            aegis
          </motion.p>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-4xl md:text-6xl mb-5 tracking-tight leading-[1.1]"
            style={{ fontWeight: 600, letterSpacing: "-0.035em" }}
          >
            Your Bitcoin.
            <br />
            <span className="text-primary">Claude&apos;s spending power.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-lg text-muted-foreground mb-10 max-w-md leading-relaxed"
          >
            Give Claude a Lightning budget. Set auto-pay limits.
            Approve with biometrics. Stay in control.
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

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="flex items-center gap-5 mb-20"
          >
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              onClick={handleCreateWallet}
              disabled={!!loading}
              className="px-7 py-3.5 rounded-xl bg-primary text-primary-foreground text-[15px] font-medium flex items-center gap-2.5 disabled:opacity-60 glow-orange"
            >
              {loading === "create" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Fingerprint className="w-4 h-4" />
              )}
              {loading === "create" ? "Creating..." : "Create Wallet"}
            </motion.button>

            <button
              onClick={handleOpenWallet}
              disabled={!!loading}
              className="text-[15px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {loading === "open" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {loading === "open" ? "Authenticating..." : "Open existing wallet"}
            </button>
          </motion.div>

          {/* Steps */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="grid md:grid-cols-3 gap-8"
          >
            {[
              {
                icon: Fingerprint,
                title: "Passkey creates your keys",
                desc: "Face ID derives your wallet. No seed phrase, ever.",
              },
              {
                icon: Shield,
                title: "Set a spending budget",
                desc: "Fund Lightning from savings. Budgets enforced cryptographically.",
              },
              {
                icon: Zap,
                title: "Claude pays, you approve",
                desc: "Auto-pay under your limit. Biometric above it.",
              },
            ].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + i * 0.1 }}
                className="space-y-2.5"
              >
                <div className="w-10 h-10 rounded-lg glass border border-border/50 flex items-center justify-center">
                  <step.icon className="w-[18px] h-[18px] text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
