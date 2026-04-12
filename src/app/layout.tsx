import type { Metadata } from "next";
import { Poppins, Inter } from "next/font/google";
import "./globals.css";
import { getServerLang } from "@/lib/i18n-server";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "EduFleet LMS",
    template: "%s | EduFleet LMS",
  },
  description: "K-12 Digital Learning Management System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const lang = getServerLang();
  return (
    <html lang={lang} className={`${poppins.variable} ${inter.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
