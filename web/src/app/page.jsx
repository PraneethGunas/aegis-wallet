"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useWallet } from "@/lib/store";
import { hasExistingWallet } from "@/lib/passkey";

/* ─── Illustration: Hero / Welcome ─── */
function IllustrationHero() {
  return (
    <div className="relative w-72 h-64 mx-auto flex items-center justify-center">
      {/* Shield with lightning bolt */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, duration: 0.5, type: "spring", stiffness: 180 }}
        className="relative"
      >
        <svg width="140" height="160" viewBox="0 0 140 160" fill="none">
          {/* Shield outline */}
          <motion.path
            d="M70 8L16 36v44c0 36 23 68 54 80 31-12 54-44 54-80V36L70 8z"
            stroke="#D4760A"
            strokeWidth="3"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.2, duration: 1, ease: "easeOut" }}
          />
          {/* Shield fill */}
          <motion.path
            d="M70 8L16 36v44c0 36 23 68 54 80 31-12 54-44 54-80V36L70 8z"
            fill="#D4760A"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.08 }}
            transition={{ delay: 0.8, duration: 0.5 }}
          />
          {/* Lightning bolt */}
          <motion.path
            d="M78 52L58 88h18l-6 24 24-40H76l2-20z"
            fill="#D4760A"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.4 }}
          />
        </svg>
      </motion.div>

      {/* Floating elements */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.8, duration: 0.4 }}
        className="absolute top-6 left-2"
      >
        <div className="w-10 h-10 rounded-xl bg-white border border-border/50 shadow-sm flex items-center justify-center">
          <Fingerprint className="w-5 h-5 text-primary/70" strokeWidth={1.5} />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.9, duration: 0.4 }}
        className="absolute top-8 right-2"
      >
        <div className="w-10 h-10 rounded-xl bg-white border border-border/50 shadow-sm flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="3" y="5" width="12" height="9" rx="2" fill="none" stroke="#2563EB" strokeWidth="1.5" />
            <circle cx="9" cy="9.5" r="1.5" fill="#2563EB" />
            <rect x="6" y="3" width="6" height="3" rx="1" fill="none" stroke="#2563EB" strokeWidth="1" opacity="0.5" />
          </svg>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.4 }}
        className="absolute bottom-2 right-6"
      >
        <div className="w-10 h-10 rounded-xl bg-white border border-border/50 shadow-sm flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M10 3L5 10h4l-1 5 5-7H9l1-5z" fill="#D4760A" />
          </svg>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Illustration: Two Layers ─── */
function IllustrationLayers() {
  return (
    <div className="relative w-72 h-64 mx-auto">
      {/* L1 — dark card */}
      <motion.div
        initial={{ opacity: 0, y: 20, rotate: -6 }}
        animate={{ opacity: 1, y: 0, rotate: -6 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="absolute top-4 left-6 w-56 h-36 rounded-2xl bg-[#1A1A1A] p-5 shadow-lg"
      >
        <p className="absolute top-3 right-4 text-[10px] font-mono text-white/30 tracking-widest uppercase">
          Layer 01
        </p>
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center mb-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1L2 5v6l6 4 6-4V5L8 1z"
              stroke="white"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="text-white text-sm font-semibold">Funding (L1)</p>
        <p className="text-white/40 text-[11px]">Secure On-Chain Storage</p>
      </motion.div>

      {/* L2 — orange card */}
      <motion.div
        initial={{ opacity: 0, y: 30, rotate: 3 }}
        animate={{ opacity: 1, y: 0, rotate: 3 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="absolute bottom-2 right-4 w-56 h-36 rounded-2xl bg-gradient-to-br from-primary to-[#b5620a] p-5 shadow-lg"
      >
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center mb-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M9 1L4 9h4l-1 6 5-8H8l1-6z"
              fill="white"
              stroke="white"
              strokeWidth="0.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="text-white text-sm font-semibold">Spending (L2)</p>
        <p className="text-white/60 text-[11px]">Instant Lightning Network</p>
      </motion.div>
    </div>
  );
}

/* ─── Illustration: Claude Budget ─── */
function IllustrationBudget() {
  return (
    <div className="relative w-64 h-64 mx-auto flex items-center justify-center">
      {/* Budget ring */}
      <motion.svg
        width="200"
        height="200"
        viewBox="0 0 200 200"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, duration: 0.5 }}
      >
        {/* Track */}
        <circle
          cx="100"
          cy="100"
          r="85"
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth="8"
        />
        {/* Spent arc — ~65% */}
        <motion.circle
          cx="100"
          cy="100"
          r="85"
          fill="none"
          stroke="#D4760A"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray="534"
          strokeDashoffset="534"
          animate={{ strokeDashoffset: 187 }}
          transition={{ delay: 0.3, duration: 1, ease: "easeOut" }}
          transform="rotate(-90 100 100)"
        />
      </motion.svg>

      {/* Claude icon center */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="absolute w-20 h-20 rounded-full bg-agent-blue flex items-center justify-center"
      >
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          {/* Simple bot face */}
          <rect x="8" y="10" width="20" height="16" rx="4" fill="white" />
          <circle cx="14" cy="18" r="2" fill="#2563EB" />
          <circle cx="22" cy="18" r="2" fill="#2563EB" />
          <rect x="12" y="4" width="12" height="4" rx="2" fill="white" opacity="0.7" />
          <rect x="16" y="2" width="4" height="4" rx="2" fill="white" opacity="0.5" />
        </svg>
      </motion.div>

      {/* Budget label */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="absolute bottom-2 font-mono text-sm text-primary font-medium"
      >
        50,000 sats
      </motion.p>
    </div>
  );
}

/* ─── Illustration: Approval ─── */
function IllustrationApproval() {
  return (
    <div className="relative w-64 h-72 mx-auto flex flex-col items-center">
      {/* Phone frame */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="w-56 rounded-3xl bg-white border border-border/60 p-4 shadow-md"
      >
        {/* Payment request card */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="rounded-xl border border-border/50 p-3 mb-5"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-md bg-agent-blue/10 flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5.5 1L2 6h3l-.5 3L8 4H5l.5-3z" fill="#2563EB" />
              </svg>
            </div>
            <span className="text-[10px] font-semibold tracking-wide uppercase text-foreground/70">
              Payment Request
            </span>
          </div>
          <p className="text-[13px] text-foreground">
            Claude wants to pay
            <br />
            <span className="font-semibold">$8.00</span> — Approve?
          </p>
        </motion.div>

        {/* Fingerprint */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="flex flex-col items-center gap-2"
        >
          <div className="w-16 h-16 rounded-2xl bg-background flex items-center justify-center">
            <Fingerprint className="w-8 h-8 text-primary" strokeWidth={1.5} />
          </div>
          <p className="text-[11px] text-muted-foreground font-medium">
            Confirm with Biometrics
          </p>
        </motion.div>

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="flex items-center justify-center gap-6 mt-4"
        >
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 3l8 8M11 3l-8 8"
                stroke="#DC2626"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="w-10 h-10 rounded-full bg-success-green/10 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 7l3 3 5-5"
                stroke="#16A34A"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ─── Illustration: All Set ─── */
function IllustrationReady() {
  return (
    <div className="relative w-64 h-56 mx-auto flex items-center justify-center">
      {/* Aegis logo / shield */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, duration: 0.5, type: "spring", stiffness: 200 }}
        className="w-24 h-24 rounded-3xl bg-white border border-border/50 shadow-md flex items-center justify-center"
      >
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect x="8" y="6" width="24" height="28" rx="4" stroke="#D4760A" strokeWidth="2" fill="none" />
          <rect x="13" y="12" width="14" height="3" rx="1.5" fill="#D4760A" opacity="0.3" />
          <rect x="13" y="18" width="14" height="3" rx="1.5" fill="#D4760A" opacity="0.3" />
          <rect x="13" y="24" width="8" height="3" rx="1.5" fill="#D4760A" opacity="0.3" />
        </svg>
      </motion.div>

      {/* Floating badges */}
      <motion.div
        initial={{ opacity: 0, x: 20, y: -10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="absolute top-4 right-8 flex flex-col gap-2"
      >
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M8 1L3 8h4l-1 5 5-7H7l1-5z" fill="#D4760A" />
          </svg>
        </div>
        <div className="w-7 h-7 rounded-lg bg-success-green/10 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M3 7l3 3 5-5"
              stroke="#16A34A"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Slide Data ─── */
const slides = [
  {
    id: "hero",
    Illustration: IllustrationHero,
    title: "Agentic Bitcoin payments, secured by you",
    description:
      "Seedless wallet. Biometric security. AI-managed Lightning payments — all within budgets you control.",
  },
  {
    id: "layers",
    Illustration: IllustrationLayers,
    title: "Two layers of Bitcoin",
    description: (
      <>
        L1 is your <strong>vault</strong> — fully self-custodial. L2 is your
        spending wallet on <strong>Lightning</strong>, fast and cheap.
      </>
    ),
  },
  {
    id: "budget",
    Illustration: IllustrationBudget,
    title: "Give Claude a spending budget",
    description:
      "Set a Lightning budget and auto-pay threshold. Claude spends within limits — no surprises.",
  },
  {
    id: "approval",
    Illustration: IllustrationApproval,
    title: "You approve what matters",
    description:
      "Payments over your threshold need biometric approval. One tap to approve, one tap to deny.",
  },
  {
    id: "ready",
    Illustration: IllustrationReady,
    title: "You're all set",
    description: "Create your wallet, fund it, and let Claude handle the rest.",
  },
];

/* ─── Main Onboarding Component ─── */
export default function Onboarding() {
  const router = useRouter();
  const { createWallet, authenticate, error } = useWallet();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(null);
  const [walletExists, setWalletExists] = useState(false);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = back
  const touchStart = useRef(null);

  const isFinal = step === slides.length - 1;

  useEffect(() => {
    setWalletExists(hasExistingWallet());
  }, []);

  const goTo = (next) => {
    if (next < 0 || next >= slides.length) return;
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const handleSkip = () => {
    if (walletExists) {
      handleOpenWallet();
    } else {
      setDirection(1);
      setStep(slides.length - 1);
    }
  };

  const handleBootstrap = async () => {
    setLoading("create");
    try {
      await createWallet();
      router.push("/dashboard");
    } catch {
      // error set via store
    } finally {
      setLoading(null);
    }
  };

  const handleOpenWallet = async () => {
    setLoading("open");
    try {
      await authenticate();
      router.push("/dashboard");
    } catch {
      // error set via store
    } finally {
      setLoading(null);
    }
  };

  // Swipe support
  const onTouchStart = (e) => {
    touchStart.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (touchStart.current === null) return;
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      goTo(step + (diff > 0 ? 1 : -1));
    }
    touchStart.current = null;
  };

  const variants = {
    enter: (d) => ({ x: d > 0 ? 200 : -200, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d) => ({ x: d > 0 ? -200 : 200, opacity: 0 }),
  };

  const slide = slides[step];

  return (
    <div
      className="min-h-screen text-foreground flex flex-col"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <button
          onClick={() => goTo(step - 1)}
          disabled={step === 0}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-foreground/60 hover:text-foreground transition-colors disabled:opacity-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {!isFinal && (
          <button
            onClick={handleSkip}
            className="text-[13px] font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Skip
          </button>
        )}
      </div>

      {/* Slide content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={slide.id}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: "easeInOut" }}
              className="flex flex-col items-center text-center"
            >
              {/* Illustration */}
              <slide.Illustration />

              {/* Text */}
              <h1
                className="text-2xl md:text-3xl mt-6 mb-3 tracking-tight leading-tight"
                style={{ fontWeight: 600, letterSpacing: "-0.03em" }}
              >
                {slide.title}
              </h1>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                {slide.description}
              </p>

              {/* Error */}
              {isFinal && error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm w-full"
                >
                  {error}
                </motion.div>
              )}

              {/* CTA — only on final slide */}
              {isFinal && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="w-full mt-8 space-y-3"
                >
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    onClick={walletExists ? handleOpenWallet : handleBootstrap}
                    disabled={!!loading}
                    className="w-full px-7 py-4 rounded-xl bg-primary text-primary-foreground text-[15px] font-medium flex items-center justify-center gap-2.5 disabled:opacity-60 glow-orange"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Fingerprint className="w-4 h-4" />
                    )}
                    {loading
                      ? walletExists
                        ? "Authenticating..."
                        : "Creating wallet..."
                      : walletExists
                        ? "Open Wallet"
                        : "Bootstrap Wallet"}
                  </motion.button>

                  {!walletExists && (
                    <button
                      onClick={handleOpenWallet}
                      disabled={!!loading}
                      className="text-[13px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mx-auto"
                    >
                      {loading === "open" && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      )}
                      Open existing wallet
                    </button>
                  )}
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom nav: dots + arrows */}
      <div className="flex items-center justify-between px-5 pb-8 pt-4">
        <button
          onClick={() => goTo(step - 1)}
          disabled={step === 0}
          className="w-10 h-10 rounded-full flex items-center justify-center text-foreground/40 hover:text-foreground transition-colors disabled:opacity-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Dots */}
        <div className="flex items-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="p-0.5"
            >
              <motion.div
                animate={{
                  width: i === step ? 24 : 8,
                  backgroundColor:
                    i === step ? "#D4760A" : "rgba(0,0,0,0.12)",
                }}
                transition={{ duration: 0.3 }}
                className="h-2 rounded-full"
              />
            </button>
          ))}
        </div>

        <button
          onClick={() => {
            if (isFinal) return;
            goTo(step + 1);
          }}
          disabled={isFinal}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            isFinal
              ? "opacity-0"
              : "bg-foreground text-background hover:bg-foreground/80"
          }`}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
