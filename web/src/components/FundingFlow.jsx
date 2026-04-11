"use client";

import { useState } from "react";
import { Copy, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";

export default function FundingFlow({ isOpen, onClose, fundingAddress }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(fundingAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden"
        >
          <div className="p-5 rounded-xl glass border border-border/50 mt-3">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium">Receive on-chain Bitcoin</p>
              <button onClick={onClose} className="w-7 h-7 rounded-lg glass border border-border/50 flex items-center justify-center hover:bg-muted transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="text-center space-y-3">
              {fundingAddress ? (
                <>
                  <div className="inline-block p-3 bg-white rounded-xl border border-border/30">
                    <QRCodeSVG value={fundingAddress} size={160} />
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 rounded-lg glass border border-border/50 font-mono text-[11px] break-all text-left">
                      {fundingAddress}
                    </code>
                    <button onClick={handleCopy} className="p-2 rounded-lg glass border border-border/50 flex-shrink-0 hover:bg-muted transition-colors">
                      {copied ? <Check className="w-3.5 h-3.5 text-success-green" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">taproot address (bc1p...)</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-4">Authenticate to view address</p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
