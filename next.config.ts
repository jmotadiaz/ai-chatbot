import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    viewTransition: true,
    authInterrupts: true,
  },
  images: {
    remotePatterns: [
      new URL("https://cwbcp1ymgf2pibcv.public.blob.vercel-storage.com/**"),
    ],
  },
};

export default nextConfig;
