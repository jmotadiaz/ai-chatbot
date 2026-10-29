import path from "node:path";
import { defineConfig } from "vitest/config";
import { initConfig } from "../config/src/config";

/**
 * The tracing tests ALWAYS run in the Test Environment (ADR 0011): the
 * initialization is explicit when this file loads, never an environment
 * variable inherited from the parent process.
 *
 * The `"config"` alias binds the package to the static bundle
 * `packages/config/src/env.test.ts`, as the consumers' configs do. The suite
 * still injects the trace directory and the enabled flag with `vi.mock("config")`
 * (the bundle is frozen), but the alias keeps the runtime resolution off the
 * argv selector, which has no flag to read inside a Vitest worker.
 */
initConfig("test");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^config$/,
        replacement: path.resolve(__dirname, "../config/src/env.test.ts"),
      },
    ],
  },
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
    },
    include: ["tests/unit/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
