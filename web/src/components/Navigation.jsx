"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings } from "lucide-react";
import { motion } from "motion/react";

const navItems = [
  { icon: LayoutDashboard, label: "Home", path: "/dashboard" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export default function Navigation({ children }) {
  const pathname = usePathname();

  if (pathname === "/") return <>{children}</>;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Desktop — thin sidebar, icons only */}
      <aside className="hidden md:flex w-16 flex-col items-center py-6 bg-sidebar/50 border-r border-border/50">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary/80 to-primary/40 mb-10" />

        <nav className="flex flex-col gap-3">
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                    isActive
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-[18px] h-[18px]" strokeWidth={isActive ? 2.2 : 1.8} />
                </motion.div>
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>

      {/* Mobile — floating pill bar */}
      <nav className="md:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-40">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex gap-2 px-3 py-2 rounded-2xl glass-strong border border-border/50"
        >
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <motion.div
                  whileTap={{ scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                    isActive
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  <Icon className="w-[18px] h-[18px]" strokeWidth={isActive ? 2.2 : 1.8} />
                </motion.div>
              </Link>
            );
          })}
        </motion.div>
      </nav>
    </div>
  );
}
