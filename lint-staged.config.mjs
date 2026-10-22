export default {
  // Chatbot package
  "packages/chatbot/**/*.{ts,tsx}": (filenames) => {
    if (!filenames.length) return [];
    const files = filenames.map((f) => `"${f}"`).join(" ");
    return [
      `pnpm --filter chatbot exec eslint --fix ${files}`,
      `pnpm --filter chatbot exec vitest related --run --passWithNoTests ${files}`,
    ];
  },

  // Coding agent package
  "packages/coding-agent/**/*.{ts,tsx}": (filenames) => {
    if (!filenames.length) return [];
    const files = filenames.map((f) => `"${f}"`).join(" ");
    return [
      `pnpm --filter coding-agent exec eslint --fix ${files}`,
      `pnpm --filter coding-agent exec vitest related --run --passWithNoTests ${files}`,
    ];
  },

  // Config package
  "packages/config/**/*.{ts,tsx}": (filenames) => {
    if (!filenames.length) return [];
    const files = filenames.map((f) => `"${f}"`).join(" ");
    return [
      `pnpm --filter config exec eslint --fix ${files}`,
      `pnpm --filter config exec vitest related --run --passWithNoTests ${files}`,
    ];
  },

  // Tracing package
  "packages/tracing/**/*.{ts,tsx}": (filenames) => {
    if (!filenames.length) return [];
    const files = filenames.map((f) => `"${f}"`).join(" ");
    return [
      `pnpm --filter tracing exec eslint --fix ${files}`,
      `pnpm --filter tracing exec vitest related --run --passWithNoTests ${files}`,
    ];
  },

  // Root configuration and scripts (excluding workspace packages)
  "*.{js,mjs,cjs,ts}": (filenames) => {
    const rootFiles = filenames.filter((f) => !f.includes("/packages/"));
    if (!rootFiles.length) return [];
    const files = rootFiles.map((f) => `"${f}"`).join(" ");
    return [`eslint --fix ${files}`];
  },

  // Model gateway (Python)
  "packages/model-gateway/**/*.py": () => [
    "pnpm test:gateway",
  ],
};
