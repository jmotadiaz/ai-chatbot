import path from "node:path";
import type { NextConfig } from "next";

const disableDevIndicators = process.env.DISABLE_DEV_INDICATOR === "1";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    viewTransition: true,
    authInterrupts: true,
  },
  // Ensure Turbopack resolves modules from this project root (avoid picking an incorrect parent workspace root).
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      new URL("https://cwbcp1ymgf2pibcv.public.blob.vercel-storage.com/**"),
    ],
  },

  ...(disableDevIndicators && { devIndicators: false }),
};


export default nextConfig;
