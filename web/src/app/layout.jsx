import "./globals.css";
import Navigation from "@/components/Navigation";
import { WalletProvider } from "@/lib/store";

export const metadata = {
  title: "Aegis — Bitcoin Wallet",
  description: "Seedless Bitcoin wallet with AI-powered payments",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <Navigation>{children}</Navigation>
        </WalletProvider>
      </body>
    </html>
  );
}
