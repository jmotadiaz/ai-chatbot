import path from "path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import { config as loadEnv } from "dotenv";
import { config } from "config";

loadEnv({
  path: ".env.test",
});

const PORT = config.port() ?? 3000;

// Set webServer.url and use.baseURL with the location of the WebServer respecting the correct set port
const baseURL = `http://localhost:${PORT}`;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  globalSetup: require.resolve("./tests/e2e/global-setup"),
  globalTeardown: require.resolve("./tests/e2e/global-teardown"),
  testDir: path.join(__dirname, "tests/e2e"),
  timeout: 50 * 1000,
  expect: {
    timeout: 15 * 1000,
  },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: config.ci(),
  /* Retry on CI only */
  retries: config.ci() ? 1 : 0,
  /* Tests share one database and one lazily compiled development server. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["html", { open: "never" }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    /* Use reduced motion for reliable E2E testing (instant scroll animations) */
    contextOptions: {
      reducedMotion: "reduce",
    },
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },

    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: "Mobile Chrome",
    //   use: { ...devices["Pixel 5"] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    // Turbopack can stall indefinitely compiling /agent/code under Node 24.
    // Webpack keeps the E2E server deterministic across local runs and CI.
    command: `npx next dev --webpack -p ${PORT}`,
    stdout: config.serverOutput() ? "pipe" : "ignore",
    stderr: config.serverOutput() ? "pipe" : "ignore",
    url: baseURL,
    reuseExistingServer: !config.ci(),
    timeout: 240 * 1000,
    // Reenvío de valores crudos al webServer (strings, defaults propios del runner).
    // A propósito NO usa config: aquí se plumbearn a un proceso hijo, no se leen
    // para la lógica de la app. Ver docs/superpowers/specs/2026-08-10-centralized-env-config-design.md.
    env: {
      DISABLE_DEV_INDICATOR: "1",
      NEXT_PUBLIC_ENV: "test",
      CODING_AGENT_ENABLED: process.env.CODING_AGENT_ENABLED ?? "true",
      CODING_AGENT_PROJECTS_ROOT: process.env.CODING_AGENT_PROJECTS_ROOT ?? "",
      CODING_AGENT_SESSIONS_DIR: process.env.CODING_AGENT_SESSIONS_DIR ?? "",
      CODING_AGENT_WORKER_URL: process.env.CODING_AGENT_WORKER_URL ?? "",
      CODING_AGENT_WORKER_PORT: process.env.CODING_AGENT_WORKER_PORT ?? "",
      CODING_AGENT_AUTH_JSON: process.env.CODING_AGENT_AUTH_JSON ?? "",
    },
  },
});
