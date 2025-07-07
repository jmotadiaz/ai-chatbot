import { clsx, type ClassValue } from "clsx";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";
import TurndownService from "turndown";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function scapeXML(str: string): string {
  if (!str) return "";

  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .trim();
}

export const handleCopy = (value: string | null | undefined) => async () => {
  if (!value) {
    toast.error("Nothing to copy");
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Text copied to clipboard");
  } catch {
    toast.error("Failed to copy text");
  }
};

export interface URLResource {
  title: string;
  content: string;
}

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

turndownService.addRule("removeScriptAndStyle", {
  filter: ["script", "style", "nav", "header", "footer", "aside"],
  replacement: () => "",
});

export async function fetchAndConvertURL(
  url: string
): Promise<URLResource | null> {
  try {
    console.log(`Fetching URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RAG-Bot/1.0)",
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Convert HTML to Markdown
    const markdown = turndownService
      .turndown(html)
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^\s+|\s+$/g, "")
      .trim();

    return {
      title: url,
      content: markdown,
    };
  } catch (error) {
    console.error(`Error processing URL ${url}:`, error);
    return null;
  }
}
