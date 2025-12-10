import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import type { Resource } from "@/lib/features/chat/types";

export interface UrlResource {
  url: string;
  container?: string;
  excludeSelectors?: string[];
}

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
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
    // Solo aplicamos esto a bloques genéricos, no a parrafos de texto real
    if (
      node.nodeName === "P" ||
      node.nodeName === "H1" ||
      node.nodeName === "H2"
    )
      return false;

    // Obtenemos clases e IDs
    const attrs =
      (node.getAttribute("class") || "") +
      " " +
      (node.getAttribute("id") || "");
    const lowerAttrs = attrs.toLowerCase();

    // Palabras clave de cosas que NO queremos indexar
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

    // Si contiene alguna palabra clave de ruido, lo borramos
    return noiseKeywords.some((keyword) => lowerAttrs.includes(keyword));
  },
  replacement: function () {
    return "";
  },
});

interface ExtractOptions {
  doc: Document;
  container?: string;
  excludeSelectors?: string[]; // Nueva propiedad opcional
}

const extractContainer = ({
  container,
  doc,
  excludeSelectors = [],
}: ExtractOptions): HTMLElement => {
  // 1. Seleccionar el elemento raíz (Container o Body)
  let rootElement: HTMLElement | null = null;

  if (container) {
    rootElement = doc.querySelector<HTMLElement>(container);
  }

  // Si no se especificó container o no se encontró, usamos el body
  const finalElement = rootElement ?? doc.body;

  // 2. Limpieza de Ruido (Sanitización del DOM)
  if (excludeSelectors.length > 0 && finalElement) {
    try {
      // Unimos todos los selectores en un solo string (ej: "nav, .footer, .ad-banner")
      // Esto es más eficiente que hacer un querySelectorAll por cada selector.
      const combinedSelector = excludeSelectors.join(", ");

      // Buscamos los elementos a eliminar SOLO dentro de nuestro finalElement
      const elementsToRemove = finalElement.querySelectorAll(combinedSelector);

      elementsToRemove.forEach((el) => {
        el.remove(); // Eliminación segura del nodo del árbol DOM
      });
    } catch (error) {
      console.warn("Error cleaning DOM selectors:", error);
      // Continuamos sin limpiar si falla un selector mal formado
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
    const dom = new JSDOM(html);
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
