import { dirname } from "path";
import { fileURLToPath } from "url";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals.js";
import nextTypescript from "eslint-config-next/typescript.js";
import { FlatCompat } from "@eslint/eslintrc";
import { importX } from 'eslint-plugin-import-x'
import tsParser from '@typescript-eslint/parser'
import { includeIgnoreFile } from "@eslint/compat";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});
const gitignorePath = fileURLToPath(new URL(".gitignore", import.meta.url));

/**
 * Specifiers a `"use client"` file may never import: the AI infrastructure
 * composition root `@/lib/infrastructure/ai` — exact or any subpath, e.g.
 * `@/lib/infrastructure/ai/inference-kit` — carries the Model Gateway client.
 * Client components get UI-safe model config from
 * `@/lib/features/foundation-model/config` and the runtime catalog from
 * `<ModelCatalogProvider>` instead. Checked for both value and type-only
 * imports: a client component has no legitimate use for an infrastructure
 * type either, so there is no `allowTypeImports`-style escape hatch here.
 */
const FORBIDDEN_CLIENT_PREFIX = "@/lib/infrastructure/ai";
const forbiddenClientImport = (source) =>
  source === FORBIDDEN_CLIENT_PREFIX || source.startsWith(`${FORBIDDEN_CLIENT_PREFIX}/`);

/**
 * Flat-config ESLint selects files by path only; a directive prologue like
 * `"use client"` is file *content*, not a path, so no combination of `files`
 * globs can scope a rule to client components only (server components live
 * under the very same directories, e.g. `components/`). This local rule does
 * its own directive check first and only then inspects imports.
 */
const noInferenceInClientComponents = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Forbid "use client" files from importing the chatbot\'s AI composition root (the Model Gateway client).',
    },
    schema: [],
    messages: {
      forbidden:
        'Forbid "use client" files from importing "{{source}}". Source UI-safe model config from "@/lib/features/foundation-model/config" and the catalog from <ModelCatalogProvider> instead.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const program = sourceCode.ast;

    let hasUseClient = false;
    for (const node of program.body) {
      const isDirectivePrologueMember =
        node.type === "ExpressionStatement" &&
        node.expression.type === "Literal" &&
        typeof node.expression.value === "string";
      if (!isDirectivePrologueMember) break;
      if (node.directive === "use client" || node.expression.value === "use client") {
        hasUseClient = true;
        break;
      }
    }
    if (!hasUseClient) return {};

    const checkSource = (node, source) => {
      if (typeof source === "string" && forbiddenClientImport(source)) {
        context.report({ node, messageId: "forbidden", data: { source } });
      }
    };

    return {
      ImportDeclaration: (node) => checkSource(node, node.source.value),
      ExportNamedDeclaration: (node) => node.source && checkSource(node, node.source.value),
      ExportAllDeclaration: (node) => checkSource(node, node.source.value),
    };
  },
};

const eslintConfig = [
  ...compat.extends(...nextCoreWebVitals.extends),
  ...compat.extends(...nextTypescript.extends),
  ...compat.extends("prettier"),
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  includeIgnoreFile(gitignorePath),
  {
    files: ["**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "import-x/no-unresolved": [2, {ignore: ["^server-only$"]}],
      "import-x/order": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      local: {
        rules: {
          "no-inference-in-client-components": noInferenceInClientComponents,
        },
      },
    },
    rules: {
      "local/no-inference-in-client-components": "error",
      // Vendor provider SDKs remain forbidden EVERYWHERE (infra included):
      // with the Model Gateway (ADR 0010) the ONLY AI transports the chatbot
      // needs are `@ai-sdk/openai-compatible` and `@ai-sdk/openai` (speech),
      // used exclusively by `lib/infrastructure/ai/`. Vendor SDKs
      // (@ai-sdk/google, @ai-sdk/anthropic, @openrouter/*, …) have no
      // legitimate chatbot import. `ai`, `@ai-sdk/react` and
      // `@ai-sdk/provider` are not vendor-specific and stay allowed. An
      // explicit list is used instead of a `@ai-sdk/*` wildcard so it does
      // not have to also negate those three.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@ai-sdk/anthropic",
                "@ai-sdk/cohere",
                "@ai-sdk/deepinfra",
                "@ai-sdk/deepseek",
                "@ai-sdk/gateway",
                "@ai-sdk/google",
                "@ai-sdk/groq",
                "@ai-sdk/perplexity",
                "@ai-sdk/xai",
                "@openrouter/ai-sdk-provider",
                "@openrouter/sdk",
              ],
              message:
                "Vendor provider SDKs are forbidden: everything goes through the Model Gateway via the chatbot's composition root (@/lib/infrastructure/ai/inference-kit), whose only transports are @ai-sdk/openai-compatible and @ai-sdk/openai.",
            },
          ],
        },
      ],
    },
  },
  {
    // Same files, minus the AI infrastructure dir: OUTSIDE of it, the whole
    // `@ai-sdk/*` family is forbidden (spec ADR 0010) except `@ai-sdk/react`,
    // which is UI, not AI transport. This block must come after the shared
    // rules block above: it refines `no-restricted-imports` by appending the
    // wildcard pattern to the same list. Files inside `lib/infrastructure/ai/`
    // keep only the vendor-SDK rule:
    // @ai-sdk/openai-compatible and @ai-sdk/openai are their transports.
    files: ["**/*.{ts,tsx}"],
    ignores: ["lib/infrastructure/ai/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@ai-sdk/*", "!@ai-sdk/react"],
              message:
                "AI SDK transports are infra-only: import @/lib/infrastructure/ai/inference-kit, or @ai-sdk/react on the client. Only lib/infrastructure/ai/ may import @ai-sdk/*.",
            },
            {
              group: [
                "@ai-sdk/anthropic",
                "@ai-sdk/cohere",
                "@ai-sdk/deepinfra",
                "@ai-sdk/deepseek",
                "@ai-sdk/gateway",
                "@ai-sdk/google",
                "@ai-sdk/groq",
                "@ai-sdk/perplexity",
                "@ai-sdk/xai",
                "@openrouter/ai-sdk-provider",
                "@openrouter/sdk",
              ],
              message:
                "Vendor provider SDKs are forbidden: everything goes through the Model Gateway via the chatbot's composition root (@/lib/infrastructure/ai/inference-kit), whose only transports are @ai-sdk/openai-compatible and @ai-sdk/openai.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
