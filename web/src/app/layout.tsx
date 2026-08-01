import type { Metadata } from "next";
import { Be_Vietnam_Pro, Geist_Mono, Source_Serif_4 } from "next/font/google";
import { NavigationProgress } from "@/components/navigation-progress";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-dm-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${BRAND.name} · ${BRAND.tagline}`,
  description: `${BRAND.pitch} — ${BRAND.productLine}`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${beVietnam.variable} ${sourceSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <NavigationProgress />
        {children}
      </body>
    </html>
  );
}
