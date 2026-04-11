"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Send, Download, Bot, Settings, Wallet } from "lucide-react";
import { motion } from "motion/react";
import ApprovalModal from "./ApprovalModal";
import { useWallet } from "@/lib/store";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Send, label: "Send", path: "/send" },
  { icon: Download, label: "Receive", path: "/receive" },
  { icon: Bot, label: "Agent", path: "/agent" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export default function Navigation({ children }) {
  const pathname = usePathname();
  const isWelcome = pathname === "/";
  const { pendingApproval, approveRequest, denyRequest, btcPrice } = useWallet();

  if (isWelcome) {
    return <>{children}</>;
  }

  const approvalAmount = pendingApproval
    ? (pendingApproval.amountSats / 100_000_000) * btcPrice
    : 0;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-20 flex-col items-center py-8 bg-sidebar border-r border-border">
        <Link href="/dashboard" className="mb-12">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <Wallet className="w-6 h-6 text-white" />
          </div>
        </Link>

        <nav className="flex-1 flex flex-col gap-6">
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path} className="relative group">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </motion.div>
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute -right-3 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-l-full"
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">{children}</main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-sidebar border-t border-border">
        <div className="flex justify-around items-center h-16 px-4">
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                className="flex-1 flex flex-col items-center justify-center"
              >
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  className={`transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </motion.div>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Approval Modal — triggered by real WebSocket events */}
      <ApprovalModal
        isOpen={!!pendingApproval}
        onClose={() => denyRequest(pendingApproval?.approvalId)}
        onApprove={() => approveRequest(pendingApproval?.approvalId)}
        onDeny={() => denyRequest(pendingApproval?.approvalId)}
        type={pendingApproval?.type || "payment"}
        amount={approvalAmount}
        reason={pendingApproval?.reason || ""}
        isUrgent={true}
      />
    </div>
  );
}
