import type {
  BundledLanguage,
  BundledTheme,
  Highlighter,
  ThemedToken,
} from "shiki";

export const LIGHT_THEME: BundledTheme = "github-light";
export const DARK_THEME: BundledTheme = "github-dark";

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((shiki) =>
      shiki.createHighlighter({ themes: [LIGHT_THEME, DARK_THEME], langs: [] }),
    );
  }
  return highlighterPromise;
}

export async function tokenize(
  content: string,
  language: string,
  theme: BundledTheme,
): Promise<ThemedToken[][]> {
  const highlighter = await getHighlighter();
  let lang = language;
  try {
    await highlighter.loadLanguage(lang as BundledLanguage);
  } catch {
    lang = "plaintext";
  }
  return highlighter.codeToTokensBase(content, {
    lang: lang as BundledLanguage,
    theme,
  });
}

export function languageFromPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  const languages: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    py: "python",
    sh: "shellscript",
    yml: "yaml",
    yaml: "yaml",
  };
  return (extension && languages[extension]) ?? "plaintext";
}
