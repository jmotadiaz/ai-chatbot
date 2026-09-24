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
 * Specifiers a `"use client"` file may never import: the `inference` kit
 * (including its `/testing` subpath) and the chatbot's AI composition root.
 * Client components get UI-safe model config from
 * `@/lib/features/foundation-model/config` instead — isomorphic, depends
 * only on `models`. Checked for both value and type-only imports: a client
 * component has no legitimate use for a kit type either, so there is no
 * `allowTypeImports`-style escape hatch here (see the ticket-07 report for
 * why every current client-side `supportedFiles` usage could just move to
 * `ChatModelConfiguration` instead of needing an exception).
 */
const FORBIDDEN_CLIENT_SPECIFIERS = [
  "inference",
  "inference/testing",
  "@/lib/infrastructure/ai/inference-kit",
];

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
        'Forbid "use client" files from importing the inference kit or the chatbot\'s AI composition root.',
    },
    schema: [],
    messages: {
      forbidden:
        '"use client" files cannot import "{{source}}". Source UI-safe model config from "@/lib/features/foundation-model/config" instead (isomorphic, depends only on "models").',
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
      if (typeof source === "string" && FORBIDDEN_CLIENT_SPECIFIERS.includes(source)) {
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
      // Provider SDKs are `packages/inference`'s exclusive concern (spec: "fuera
      // de packages/inference nadie importa @ai-sdk/* de proveedor,
      // @openrouter/ai-sdk-provider ni @openrouter/sdk"). `ai`, `@ai-sdk/react`
      // and `@ai-sdk/provider` are not vendor-specific and stay allowed. An
      // explicit list is used instead of a `@ai-sdk/*` wildcard so it does not
      // have to also negate those three. Scoped to this package only: chatbot's
      // `eslint .` never resolves `packages/inference/**` at all, and no sibling
      // package declares any of these as a dependency, so this is the one place
      // in the repo where the invariant needs enforcing.
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
                "@ai-sdk/openai",
                "@ai-sdk/openai-compatible",
                "@ai-sdk/perplexity",
                "@ai-sdk/xai",
                "@openrouter/ai-sdk-provider",
                "@openrouter/sdk",
              ],
              message:
                "Provider SDKs are packages/inference's exclusive concern. Resolve a Model Configuration through the chatbot's composition root (@/lib/infrastructure/ai/inference-kit) instead of importing a provider SDK directly.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
