import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "./tests/mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    // React 19 only exports `act` from its development build; force test
    // mode so the suite is not affected by an ambient NODE_ENV=production.
    env: {
      NODE_ENV: "test",
    },
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/component/**/*.test.ts",
      "tests/component/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
      "tests/integration/**/*.test.tsx",
      "tests/contract/**/*.test.ts",
      "tests/contract/**/*.test.tsx",
    ],
    // jsdom test files need a Web Storage implementation: Node 26 exposes an
    // unconfigured `localStorage` global, which makes vitest's jsdom
    // environment skip jsdom's own. See tests/helpers/web-storage-setup.ts.
    setupFiles: ["./tests/helpers/web-storage-setup.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
