import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FEDMOGA Membership Portal",
  description: "FEDMOGA membership registration",
  icons: { icon: "/logo.jpg" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
