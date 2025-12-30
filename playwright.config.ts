import path from "path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import { config } from "dotenv";

config({
  path: ".env.test",
});

const setDefaultEnv = (key: string, value: string) => {
  if (!process.env[key]) {
    process.env[key] = value;
  }
};

// Provide sensible defaults so `pnpm test` works even when `.env.test` is absent.
// The test DB is exposed by docker-compose.test.yml on localhost:5434.
setDefaultEnv("POSTGRES_URL", "postgres://postgres:postgres@localhost:5434/test");
// Required by tests/e2e/fixtures.ts for signing Auth.js session cookies.
setDefaultEnv("AUTH_SECRET", "test-auth-secret-change-me");
setDefaultEnv("PORT", "3000");

const PORT = process.env.PORT || 3000;

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
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: 1,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["html", { open: "never" }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    contextOptions: {
      reducedMotion: "reduce",
    },
  },

  /* Configure projects for major browsers */
  projects: [
    // {
    //   name: "chromium",
    //   use: { ...devices["Desktop Chrome"] },
    // },

    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },

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
    // Use webpack for E2E to avoid Turbopack-only font resolution/TLS issues that can cause the server to exit early.
    command: `npx next dev --webpack -p ${PORT}`,
    stdout: !!process.env.SERVER_OUTPUT ? "pipe" : "ignore",
    stderr: !!process.env.SERVER_OUTPUT ? "pipe" : "ignore",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240 * 1000,
    env: {
      PORT: String(PORT),
      USE_MOCK_PROVIDERS: "1",
      DISABLE_DEV_INDICATOR: "1",
    },
  },
});
