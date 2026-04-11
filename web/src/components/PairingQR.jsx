"use client";

import { useState } from "react";
import { QrCode, Copy, Check } from "lucide-react";
import { motion } from "motion/react";

export default function PairingQR({ configString = "", onConfirm }) {
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(configString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!showQR) {
    return (
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setShowQR(true)}
        className="px-8 py-4 rounded-xl bg-secondary text-secondary-foreground flex items-center justify-center gap-2 mx-auto"
      >
        <QrCode className="w-5 h-5" />
        Generate Connection
      </motion.button>
    );
  }

  return (
    <div className="space-y-4">
      {/* QR Code Placeholder — replace with real QR generation */}
      <div className="inline-block p-6 rounded-xl bg-white mx-auto">
        <svg width="200" height="200" viewBox="0 0 200 200">
          <rect width="200" height="200" fill="white" />
          <g fill="black">
            <rect x="20" y="20" width="50" height="50" />
            <rect x="28" y="28" width="34" height="34" fill="white" />
            <rect x="36" y="36" width="18" height="18" />
            <rect x="130" y="20" width="50" height="50" />
            <rect x="138" y="28" width="34" height="34" fill="white" />
            <rect x="146" y="36" width="18" height="18" />
            <rect x="20" y="130" width="50" height="50" />
            <rect x="28" y="138" width="34" height="34" fill="white" />
            <rect x="36" y="146" width="18" height="18" />
          </g>
        </svg>
      </div>

      <div className="p-4 rounded-xl bg-muted">
        <p className="text-sm mb-2 text-muted-foreground">Or paste this in Claude:</p>
        <div className="flex items-center gap-2">
          <code className="text-xs break-all flex-1">
            {configString || "aegis://connect?token=..."}
          </code>
          <button onClick={handleCopy} className="shrink-0 text-muted-foreground hover:text-foreground">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Scan this QR code or paste the connection string in Claude to complete setup
      </p>

      {onConfirm && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onConfirm}
          className="w-full px-6 py-3 rounded-xl border border-border hover:bg-muted transition-colors"
        >
          I&apos;ve Connected Claude
        </motion.button>
      )}
    </div>
  );
}
