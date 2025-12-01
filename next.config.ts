import type { NextConfig } from "next";

const disableDevIndicators = process.env.DISABLE_DEV_INDICATOR === "1";

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

  ...(disableDevIndicators && { devIndicators: false }),
  webpack: (config) => {
    config.module.rules.push({
      test: /\.node$/,
      use: "node-loader",
    });
    // Exclude tree-sitter binaries from being bundled by webpack
    config.externals = [...(config.externals || []), "tree-sitter", "tree-sitter-bash", "tree-sitter-typescript", "code-chopper"];
    return config;
  },
};


export default nextConfig;
