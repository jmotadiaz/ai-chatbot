import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { config, initConfig } from "config";

/**
 * El Entorno de Playwright es SIEMPRE test (ADR 0011): la inicialización es
 * explícita al cargar este fichero — sin `dotenv`, sin `.env.test` y sin
 * bloque `env` de negocio en el `webServer`. Todo lo que antes se plumbaba por
 * variables (`NEXT_PUBLIC_ENV`, `CODING_AGENT_*`, `POSTGRES_URL`, …) lo
 * aporta el bundle estático de test (`packages/config/src/env.test.ts`) y el
 * launcher `scripts/next-cli.ts` (`--env=test`) al proceso hijo.
 *
 * Es `.mts` (ESM) a propósito: `packages/config` es ESM (`"type": "module"`) y
 * el transpilador CJS con el que Playwright carga un `playwright.config.ts`
 * rompe al requerir sus módulos (`import.meta`). Cargado como ESM, el config
 * importa el paquete `config` nativamente.
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
  globalSetup: path.join(import.meta.dirname, "tests/e2e/global-setup.ts"),
  globalTeardown: path.join(import.meta.dirname, "tests/e2e/global-teardown.ts"),
  testDir: path.join(import.meta.dirname, "tests/e2e"),
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
  /* No `workers` cap: Playwright defaults to 50% of CPU cores. Parallel
   * safety comes from test isolation, not serialisation — every test gets
   * its own user (random email in `tests/e2e/fixtures.ts`), so chats,
   * projects and hub instances never leak across workers. The dev server and
   * the Mock Model Gateway (`:4001`) are shared read-only infrastructure:
   * the gateway profile is stateless (answers derive from the request alone)
   * and the app caches the catalog per process. */
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
    // Turbopack (the launcher's default): it compiles a cold route in well
    // under a second, so parallel workers no longer queue behind `next dev`'s
    // compile-on-demand. The previous `--webpack` pin existed because
    // Turbopack could get stuck compiling `/agent/code` under Node 24; Next
    // 16.1.1 no longer does (measured: the whole suite on 4 workers, 1.8 min).
    // The Environment, the port and NODE_ENV are decided by the launcher.
    command: `npx tsx scripts/next-cli.ts dev --env=test --port=${PORT}`,
    // `E2E_SERVER_OUTPUT=1` pipes the dev-server output into the run: when a
    // cascading failure smells like the server dying (ERR_CONNECTION_REFUSED
    // from one test onwards), the cause is in its stdout. Harness-level flag
    // (like `CI` above), not app configuration.
    stdout:
      process.env.E2E_SERVER_OUTPUT || config.serverOutput()
        ? "pipe"
        : "ignore",
    stderr:
      process.env.E2E_SERVER_OUTPUT || config.serverOutput()
        ? "pipe"
        : "ignore",
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
