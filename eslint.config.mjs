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
      "import-x/no-unresolved": [2, {ignore: ["^server-only$"]}],
      "import-x/order": "error",
    },
  }
];

export default eslintConfig;
