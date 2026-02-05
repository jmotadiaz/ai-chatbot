import React from "react";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/app/providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { getSession } from "@/lib/features/auth/cached-auth";
import { getUser } from "@/lib/features/auth/queries";
const albertSans = localFont({
  src: [
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-100.woff2",
      weight: "100",
      style: "normal",
    },
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-100italic.woff2",
      weight: "100",
      style: "italic",
    },
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-200.woff2",
      weight: "200",
      style: "normal",
    },
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-200italic.woff2",
      weight: "200",
      style: "italic",
    },
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-300.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-300italic.woff2",
      weight: "300",
      style: "italic",
    },
    // Albert Sans "regular/italic" maps to 400 weight.
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-italic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-500.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-500italic.woff2",
      weight: "500",
      style: "italic",
    },
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-600.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-600italic.woff2",
      weight: "600",
      style: "italic",
    },
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-700.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-700italic.woff2",
      weight: "700",
      style: "italic",
    },
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-700.woff2",
      weight: "800",
      style: "normal",
    },
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-700italic.woff2",
      weight: "800",
      style: "italic",
    },
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-700.woff2",
      weight: "900",
      style: "normal",
    },
    {
      path: "../public/fonts/albert-sans/albert-sans-v4-latin-700italic.woff2",
      weight: "900",
      style: "italic",
    },
  ],
  // Match next/font/google defaults (text remains visible while the font loads).
  display: "swap",
  variable: "--font-albert-sans",
});

// Note: Fira Code local font file is not present under /public/fonts/fira-code right now.
// We keep the CSS variable working (used by globals.css) via a system-mono fallback below.
const systemMonoFallback =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

export const metadata: Metadata = {
  title: "Chatbot",
  description:
    "Project to use different AI models to create a chatbot with Next.js and Vercel AI SDK",
};

export async function generateViewport(): Promise<Viewport> {
  const session = await getSession();
  const userEmail = session?.user?.email;

  let theme = "system";

  if (userEmail) {
    const [user] = await getUser(userEmail);
    if (user?.theme) {
      theme = user.theme;
    }
  }

  if (theme === "dark") {
    return {
      width: "device-width",
      initialScale: 1,
      maximumScale: 1,
      userScalable: false,
      interactiveWidget: "resizes-visual",
      themeColor: "#161618",
    };
  }

  if (theme === "light") {
    return {
      width: "device-width",
      initialScale: 1,
      maximumScale: 1,
      userScalable: false,
      interactiveWidget: "resizes-visual",
      themeColor: "#ffffff",
    };
  }

  return {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    interactiveWidget: "resizes-visual",
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#ffffff" },
      { media: "(prefers-color-scheme: dark)", color: "#161618" },
    ],
  };
}

interface RootLayoutProps {
  children: React.ReactNode;
}

const RootLayout: React.FC<RootLayoutProps> = ({ children }) => {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${albertSans.variable} antialiased`}
        style={
          {
            // Provide a safe default for --font-fira-code so --font-mono resolves.
            "--font-fira-code": systemMonoFallback,
          } as React.CSSProperties
        }
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
};

export default RootLayout;
