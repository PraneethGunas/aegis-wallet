"use client";

import { useState, useEffect } from "react";
import { Copy, Check, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import * as api from "@/lib/api";

export default function FundingFlow({ isOpen, onClose, fundingAddress: propAddress }) {
  const [copied, setCopied] = useState(false);
  const [address, setAddress] = useState(propAddress || null);
  const [loading, setLoading] = useState(false);

  // Fetch from backend if no client-side address
  useEffect(() => {
    if (propAddress) {
      setAddress(propAddress);
      return;
    }
    if (!isOpen || address) return;

    setLoading(true);
    api.wallet.getFundingAddress()
      .then((res) => setAddress(res.address))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, propAddress, address]);

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
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
              {loading ? (
                <div className="py-6">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : address ? (
                <>
                  <div className="inline-block p-3 bg-white rounded-xl border border-border/30">
                    <QRCodeSVG value={address} size={160} />
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 rounded-lg glass border border-border/50 font-mono text-[11px] break-all text-left">
                      {address}
                    </code>
                    <button onClick={handleCopy} className="p-2 rounded-lg glass border border-border/50 flex-shrink-0 hover:bg-muted transition-colors">
                      {copied ? <Check className="w-3.5 h-3.5 text-success-green" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">taproot address (bc1p...)</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-4">Could not load address</p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
