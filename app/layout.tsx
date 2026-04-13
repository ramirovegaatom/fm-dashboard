import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@atomchat.io/tokens/css";
import "@atomchat.io/css";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Field Marketing Dashboard",
  description: "Métricas de eventos — Luma + Attio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" data-theme="light" className={`${inter.variable} h-full antialiased`}>
      <body>{children}</body>
    </html>
  );
}
