import type { Metadata } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";

// Cinzel for headings: it is drawn from Roman inscriptional capitals, which is
// as close as a web font gets to the carved-serif logotype on the 1993 box
// without pretending to be it.
const cinzel = Cinzel({ weight: ["500", "700"], subsets: ["latin"], variable: "--font-cinzel" });

// Inter for everything else. Card text is dense Polish with heavy diacritics
// (ą ć ę ł ń ó ś ź ż) and this renders them cleanly at small sizes, which a
// display face would not.
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Magiczny Miecz",
  description: "Sędzia do gry planszowej Magiczny Miecz.",
};

// The table screen and the phones are looked at for hours in a dim room, and
// the browser chrome should not glow white around them.
export const viewport = { themeColor: "#10131f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${cinzel.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
