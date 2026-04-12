"use client";

import { useState, useEffect } from "react";
import { Copy, Check, X, RefreshCw, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { getNextFundingAddress, isKeysLoaded, deriveKeys, getFundingAddress } from "@/lib/bitcoin";
import { authenticate } from "@/lib/passkey";

export default function FundingFlow({ isOpen, onClose, fundingAddress }) {
  const [copied, setCopied] = useState(false);
  const [displayAddress, setDisplayAddress] = useState(fundingAddress);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    if (isOpen && fundingAddress) {
      setDisplayAddress(fundingAddress);
    }
  }, [isOpen, fundingAddress]);

  const handleCopy = () => {
    navigator.clipboard.writeText(displayAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNewAddress = async () => {
    setRotating(true);
    try {
      // If keys aren't in memory, re-auth silently to reload them
      if (!isKeysLoaded()) {
        const { entropy } = await authenticate();
        deriveKeys(entropy);
      }
      const { address } = getNextFundingAddress();
      setDisplayAddress(address);
    } catch {
      // Auth cancelled or failed — no action needed
    }
    setRotating(false);
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
              {displayAddress ? (
                <>
                  <div className="inline-block p-3 bg-white rounded-xl border border-border/30">
                    <QRCodeSVG value={displayAddress} size={160} />
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 rounded-lg glass border border-border/50 font-mono text-[11px] break-all text-left">
                      {displayAddress}
                    </code>
                    <button onClick={handleCopy} className="p-2 rounded-lg glass border border-border/50 flex-shrink-0 hover:bg-muted transition-colors">
                      {copied ? <Check className="w-3.5 h-3.5 text-success-green" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <p className="text-[11px] text-muted-foreground font-mono">taproot (bc1p...)</p>
                    <button
                      onClick={handleNewAddress}
                      disabled={rotating}
                      className="text-[11px] text-secondary hover:text-secondary/80 flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      {rotating ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
                      new address
                    </button>
                  </div>
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
