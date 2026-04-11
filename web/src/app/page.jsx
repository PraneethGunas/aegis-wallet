"use client";

import { useRouter } from "next/navigation";
import { Fingerprint, Shield, Zap } from "lucide-react";
import { motion } from "motion/react";

export default function Welcome() {
  const router = useRouter();

  const handleCreateWallet = () => {
    // TODO: Trigger WebAuthn passkey creation → passkey.createWallet()
    router.push("/dashboard");
  };

  const handleOpenWallet = () => {
    // TODO: Trigger WebAuthn passkey authentication → passkey.authenticate()
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="relative h-screen flex items-center overflow-hidden">
        {/* Background gradient (no external image dependency) */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-8 md:px-12 w-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-2xl"
          >
            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="mb-8"
            >
              <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/30">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary" />
                <span className="text-2xl tracking-tight">Aegis</span>
              </div>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-5xl md:text-7xl mb-6 tracking-tight"
              style={{ fontWeight: 600 }}
            >
              Your Bitcoin wallet.
              <br />
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                No seed phrase.
              </span>
              <br />
              Just you.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="text-xl text-muted-foreground mb-12 max-w-xl"
            >
              Biometric security meets AI-powered payments. Self-custody made
              simple.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.8 }}
              className="flex flex-col sm:flex-row gap-4 mb-16"
            >
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleCreateWallet}
                className="group relative px-8 py-4 rounded-2xl bg-gradient-to-r from-primary to-primary/90 text-primary-foreground overflow-hidden"
              >
                <motion.div
                  className="absolute inset-0 bg-white/20"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  style={{ borderRadius: "inherit" }}
                />
                <span className="relative flex items-center justify-center gap-3 text-lg">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <Fingerprint className="w-5 h-5" />
                  </motion.div>
                  Create Wallet
                </span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleOpenWallet}
                className="px-8 py-4 rounded-2xl border border-border text-foreground hover:bg-muted transition-colors text-lg"
              >
                Open Wallet
              </motion.button>
            </motion.div>

            {/* 3-Step Explainer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 0.8 }}
              className="grid md:grid-cols-3 gap-6"
            >
              {[
                {
                  icon: Fingerprint,
                  title: "Biometric creates your wallet",
                  description:
                    "Face ID or fingerprint. No passwords to remember.",
                },
                {
                  icon: Shield,
                  title: "Fund with Bitcoin",
                  description: "Your savings stay in your control.",
                },
                {
                  icon: Zap,
                  title: "Your AI agent handles payments",
                  description:
                    "Claude manages spending within your limits.",
                },
              ].map((step, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.2 + index * 0.2, duration: 0.6 }}
                  className="flex flex-col gap-3"
                >
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                    <step.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="mb-1">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
