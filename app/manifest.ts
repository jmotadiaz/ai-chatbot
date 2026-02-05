import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Chatbot",
    short_name: "AI Chatbot",
    description: "AI Chatbot",
    start_url: "/",
    display: "standalone",
    background_color: "#161618",
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
