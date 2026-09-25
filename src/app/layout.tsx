import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { DENSITY_BOOT_SCRIPT, DENSITY_CSS } from "@/lib/density";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Ticket System",
    template: "%s · Ticket System",
  },
  description:
    "A Linear-style ticket tracker whose status stays in sync with GitHub work.",
  openGraph: {
    title: "Ticket System",
    description:
      "A Linear-style ticket tracker whose status stays in sync with GitHub work.",
    type: "website",
  },
  // PWA (B12): the manifest comes from app/manifest.ts.
  applicationName: "Ticket System",
  appleWebApp: {
    capable: true,
    title: "Tickets",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

// Browser chrome follows the --background token of each theme.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#08090a" },
  ],
  viewportFit: "cover",
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
      // next-themes (.dark) and the density script (data-density) touch <html>
      // before hydration; SSR must not strip them.
      suppressHydrationWarning
    >
      <head>
        {/* Density runs before first paint on every page. The root layout never
            re-renders on soft navigation, so the script is only ever SSR'd. */}
        <script dangerouslySetInnerHTML={{ __html: DENSITY_BOOT_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: DENSITY_CSS }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
        <RegisterServiceWorker />
        <OfflineBanner />
      </body>
    </html>
  );
}
