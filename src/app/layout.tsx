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

// Overridden per shop by generateMetadata in (public)/b/[slug].
export const metadata: Metadata = {
  title: "Book an appointment",
  description: "Online booking for barbershops.",
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
