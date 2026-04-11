import "./globals.css";
import Navigation from "@/components/Navigation";
import { WalletProvider } from "@/lib/store";

export const metadata = {
  title: "Aegis — Agentic Bitcoin Wallet",
  description: "Give Claude a spending budget. Set limits, approve with biometrics, stay in control.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="checks-bg">
        <WalletProvider>
          <Navigation>{children}</Navigation>
        </WalletProvider>
      </body>
    </html>
  );
}
