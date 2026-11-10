import type { Metadata, Viewport } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

/** Licensed TMICC web-font kit (Monotype). Families: JuanaSemiBoldItalic, NeueHaasGroteskDisplay55Roman, NeueHaasGroteskDisplay65Medium. */
const BRAND_FONT_KIT = "https://cdn.fonts.net/kit/b37d69d5-8a3b-475c-92b5-c8505f768d2f/b37d69d5-8a3b-475c-92b5-c8505f768d2f.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Magnum Shareholder Portal",
    template: "%s · The Magnum Ice Cream Company",
  },
  description: "Secure delivery of individual dividend statements from The Magnum Ice Cream Company.",
  applicationName: "Magnum Shareholder Portal",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/images/brand/tmicc-monogram.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png", sizes: "256x256" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#2b1810",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${playfair.variable} h-full`}>
      <head>
        <link rel="preconnect" href="https://cdn.fonts.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href={BRAND_FONT_KIT} />
      </head>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
