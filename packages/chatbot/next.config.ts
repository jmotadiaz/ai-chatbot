import path from "node:path";
import type { NextConfig } from "next";
import { config } from "config";

const disableDevIndicators = config.disableDevIndicator();

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    viewTransition: true,
    authInterrupts: true,
    optimizePackageImports: [
      "@radix-ui/react-collapsible",
      "@radix-ui/react-use-controllable-state",
      "motion/react",
      "sonner",
      "use-debounce",
    ],
  },
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  images: {
    remotePatterns: [
      new URL("https://cwbcp1ymgf2pibcv.public.blob.vercel-storage.com/**"),
    ],
  },

  ...(disableDevIndicators && { devIndicators: false }),
};

export default nextConfig;
