import "./globals.css";
import Navigation from "@/components/Navigation";

export const metadata = {
  title: "Aegis — Bitcoin Wallet",
  description: "Seedless Bitcoin wallet with AI-powered payments",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Navigation>{children}</Navigation>
      </body>
    </html>
  );
}
