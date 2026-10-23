import path from "path";
import { defineConfig, devices } from "@playwright/test";
import { config, initConfig } from "config";

/**
 * El Entorno de Playwright es SIEMPRE test (ADR 0011): la inicialización es
 * explícita al cargar este fichero — sin `dotenv`, sin `.env.test` y sin
 * bloque `env` de negocio en el `webServer`. Todo lo que antes se plumbaba por
 * variables (`NEXT_PUBLIC_ENV`, `CODING_AGENT_*`, `POSTGRES_URL`, …) lo
 * aporta el bundle estático de test (`packages/config/src/env.test.ts`) y el
 * launcher `scripts/next-cli.ts` (`--env=test`) al proceso hijo.
 */
initConfig("test");

// `CI` la provee el runner de Playwright (variable del framework, no
// configuración de la app): por eso sigue leyéndose de process.env.
const CI = Boolean(process.env.CI);

const PORT = config.port();

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
  forbidOnly: CI,
  /* Retry on CI only */
  retries: CI ? 1 : 0,
  /* Tests share one database and one lazily compiled development server. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["html", { open: "never" }]],
  /* Shared settings for all the projects below. */
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
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    // Turbopack puede atascarse compilando /agent/code bajo Node 24: el e2e
    // usa Webpack (`--webpack`) para que el servidor sea determinista en local
    // y en CI. El Entorno, el puerto y NODE_ENV los decide el launcher.
    command: `npx tsx scripts/next-cli.ts dev --env=test --webpack --port=${PORT}`,
    stdout: config.serverOutput() ? "pipe" : "ignore",
    stderr: config.serverOutput() ? "pipe" : "ignore",
    // Sonda de readiness en /login, no en `/` (ADR 0010): la home hidrata el
    // catálogo desde el Model Gateway, y el Mock (:4001) lo arranta el
    // globalSetup de Playwright — que se ejecuta DESPUÉS de esperar esta
    // sonda. Sondar `/` sería un deadlock: el gateway ya está garantizado para
    // el momento en que corren los tests, pero la sonda debe valer sin gateway.
    url: `${baseURL}/login`,
    reuseExistingServer: !CI,
    timeout: 240 * 1000,
    // Sin bloque `env`: no hay variables de configuración de la app (ADR 0011).
    // El único proceso hijo que arranca aquí es next-cli, que ya recibe
    // --env=test por argv y fija NODE_ENV/TURBOPACK internamente.
  },
});
