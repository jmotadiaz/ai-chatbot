import path from "path";
import { defineConfig } from "vitest/config";
import { initConfig } from "../config/src/config";

/**
 * Los tests del chatbot corren SIEMPRE en el Entorno de Test (ADR 0011):
 * `initConfig("test")` al cargar este fichero (proceso principal — el mismo
 * que ejecuta `globalSetup`), nunca una variable de entorno heredada.
 *
 * El alias `"config"` enlaza el paquete al shim `lib/config-bundle/env.test.ts`
 * (re-exporta la superficie completa del paquete y fija la fachada al bundle
 * congelado de test): los workers de Vitest NO re-evalúan este config ni
 * conservan el argv del binario, así que sin alias el selector de `config`
 * fallaría (`Missing required CLI flag --env`) en cada worker. Con el alias,
 * cada worker importa directamente el bundle estático de test — mismo
 * módulo que soldaría `next.config.ts` en un build de test — y un test no
 * puede observar secretos ni rutas de dev/prod (ver shim para por qué no se
 * apunta a `packages/config/src/env.test.ts` directamente).
 *
 * `globalSetup` levanta el Mock Model Gateway en el puerto canónico `:4001`
 * (`config.modelGatewayUrl()` en test) en el proceso principal, con teardown;
 * antes vivía en `setupFiles` como server por worker con un puerto efímero
 * mutando `process.env.MODEL_GATEWAY_URL` — mutación que el bundle congelado
 * ignora (y que además metía `node:http` en los workers jsdom).
 */
initConfig("test");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^config$/,
        replacement: path.resolve(__dirname, "./lib/config-bundle/env.test.ts"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "."),
      },
      {
        find: "server-only",
        replacement: path.resolve(__dirname, "./tests/mocks/server-only.ts"),
      },
    ],
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
    globalSetup: ["./tests/helpers/mock-gateway-global-setup.ts"],
    setupFiles: ["./tests/helpers/web-storage-setup.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
