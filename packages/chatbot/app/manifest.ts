import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Chatbot",
    short_name: "AI Chatbot",
    description: "AI Chatbot",
    start_url: "/",
    display: "standalone",
    // Splash / pre-paint background of the installed app, matching the OLED
    // pure-black dark theme. Manifests cannot be media-query aware, so this one
    // is static. The theme-following phone chrome (status + navigation bars)
    // comes from the per-theme <meta name="theme-color"> in app/layout.tsx and
    // components/theme-color-manager.tsx.
    // Do NOT add `theme_color` here: a single static value pins both phone bars
    // and breaks the dark <-> light switch.
    background_color: "#000000",
    icons: [
      {
        src: "/app-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
