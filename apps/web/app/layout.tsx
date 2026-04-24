import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Savia",
  description: "Restaurant invoice intelligence platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
