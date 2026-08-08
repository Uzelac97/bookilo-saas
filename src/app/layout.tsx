import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * The product's own metadata, and only a fallback.
 *
 * Deliberately no `title.template` here. A template on the root layout would
 * cascade into (public)/b/[slug], where the title is the shop's name — and a
 * customer booking a haircut is a customer of the shop, not of Bookilo. The
 * owner-facing subtree gets the brand suffix from (dashboard)/layout.tsx
 * instead, which is the only place it belongs.
 */
export const metadata: Metadata = {
  title: "Bookilo",
  description: "Online booking for barbershops and hair salons.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* font-sans is load-bearing, not decoration: it is the only thing that
          actually applies the Geist font loaded above. See the note in
          globals.css for what it replaced and why the class has to sit here
          rather than in the stylesheet. */}
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
