const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;

function color(text: string, code: string): string {
  return `${code}${text}${ANSI.reset}`;
}

export const colors = {
  user: (text: string) => color(text, ANSI.blue + ANSI.bold),
  assistant: (text: string) => color(text, ANSI.green),
  system: (text: string) => color(text, ANSI.gray + ANSI.dim),
  info: (text: string) => color(text, ANSI.cyan),
  warn: (text: string) => color(text, ANSI.yellow),
  error: (text: string) => color(text, ANSI.red),
  highlight: (text: string) => color(text, ANSI.magenta + ANSI.bold),
  dim: (text: string) => color(text, ANSI.dim),
  separator: () => color("─".repeat(60), ANSI.gray),
  bold: (text: string) => color(text, ANSI.bold),
};
