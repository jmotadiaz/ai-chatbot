import { JSDOM, VirtualConsole } from "jsdom";
import TurndownService from "turndown";
import type { Resource } from "@/lib/features/rag/types";

export interface UrlResource {
  url: string;
  container?: string;
  excludeSelectors?: string[];
}

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

turndownService.addRule("textOnlyInLinks", {
  filter: "a", // Matches every <a> tag
  replacement: function (content) {
    // 'content' is the text inside the link
    return content;
  },
});

turndownService.addRule("removeDistractions", {
  filter: [
    "script",
    "style",
    "nav",
    "header",
    "footer",
    "aside",
    "form",
    "iframe",
    "button",
    "input",
    "select",
    "textarea",
    "noscript",
    "canvas",
    "dialog",
    "menu",
  ],
  replacement: () => "",
});

turndownService.addRule("removeGenericDistractions", {
  filter: function (node) {
    // We only apply this to generic blocks, not to real text paragraphs
    if (
      node.nodeName === "P" ||
      node.nodeName === "H1" ||
      node.nodeName === "H2"
    )
      return false;

    // We grab classes and IDs
    const attrs =
      (node.getAttribute("class") || "") +
      " " +
      (node.getAttribute("id") || "");
    const lowerAttrs = attrs.toLowerCase();

    // Keywords for things we do NOT want to index
    const noiseKeywords = [
      "share",
      "social",
      "cookie",
      "banner",
      "popup",
      "modal",
      "newsletter",
      "promo",
      "advert",
      "related",
      "recommend",
      "sidebar",
      "comment",
      "feedback",
      "meta",
      "hidden",
      "toc",
    ];

    // If it contains any noise keyword, we drop it
    return noiseKeywords.some((keyword) => lowerAttrs.includes(keyword));
  },
  replacement: function () {
    return "";
  },
});

interface ExtractOptions {
  doc: Document;
  container?: string;
  excludeSelectors?: string[]; // New optional property
}

const extractContainer = ({
  container,
  doc,
  excludeSelectors = [],
}: ExtractOptions): HTMLElement => {
  // 1. Select the root element (Container or Body)
  let rootElement: HTMLElement | null = null;

  if (container) {
    rootElement = doc.querySelector<HTMLElement>(container);
  }

  // If no container was given or it was not found, we use the body
  const finalElement = rootElement ?? doc.body;

  // 2. Noise Cleanup (DOM sanitization)
  if (excludeSelectors.length > 0 && finalElement) {
    try {
      // Join all selectors into a single string (e.g. "nav, .footer, .ad-banner")
      // This is more efficient than a querySelectorAll per selector.
      const combinedSelector = excludeSelectors.join(", ");

      // We look for the elements to remove ONLY inside our finalElement
      const elementsToRemove = finalElement.querySelectorAll(combinedSelector);

      elementsToRemove.forEach((el) => {
        el.remove(); // Safe removal of the node from the DOM tree
      });
    } catch (error) {
      console.warn("Error cleaning DOM selectors:", error);
      // We carry on without cleaning if a malformed selector fails
    }
  }

  return finalElement;
};

export async function fetchAndConvertURL({
  url,
  container,
  excludeSelectors,
}: UrlResource): Promise<Resource | null> {
  try {
    console.log(`Fetching URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RAG-Bot/1.0)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }

    const html = await response.text();
    const virtualConsole = new VirtualConsole();
    virtualConsole.sendTo(console, { omitJSDOMErrors: true });
    const dom = new JSDOM(html, { virtualConsole });
    const doc = dom.window.document;

    // Convert HTML to Markdown
    const markdown = turndownService
      .turndown(extractContainer({ container, doc, excludeSelectors }))
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^\s+|\s+$/g, "")
      .trim();

    return {
      title: doc.title || url,
      url,
      content: markdown,
    };
  } catch (error) {
    console.error(`Error processing URL ${url}:`, error);
    return null;
  }
}
