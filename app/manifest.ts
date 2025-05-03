import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Chatbot",
    short_name: "AI Chatbot",
    description: "AI Chatbot",
    start_url: "/",
    display: "standalone",
    background_color: "#000",
    theme_color: "#000",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
