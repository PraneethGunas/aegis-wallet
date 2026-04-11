"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";

export default function PairingQR({ configString = "", onConfirm }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(configString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* QR Code */}
      <div className="inline-block p-6 rounded-xl bg-white mx-auto">
        {configString ? (
          <QRCodeSVG value={configString} size={200} level="M" includeMargin={false} />
        ) : (
          <div className="w-[200px] h-[200px] flex items-center justify-center text-gray-400 text-sm">
            Generating...
          </div>
        )}
      </div>

      <div className="p-4 rounded-xl bg-muted">
        <p className="text-sm mb-2 text-muted-foreground">Or paste this in Claude:</p>
        <div className="flex items-center gap-2">
          <code className="text-xs break-all flex-1">
            {configString || "Generating config..."}
          </code>
          <button
            onClick={handleCopy}
            disabled={!configString}
            className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
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
