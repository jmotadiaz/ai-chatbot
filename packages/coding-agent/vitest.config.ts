import path from "node:path";
import { defineConfig } from "vitest/config";
import { initConfig } from "../config/src/config";

/**
 * Los tests del Coding Agent Worker corren SIEMPRE en el Entorno de Test
 * (ADR 0011): la inicialización es explícita al cargar este fichero, nunca una
 * variable de entorno heredada del worker padre.
 *
 * El alias `"config"` enlaza el paquete al bundle estático `env.test.ts`, el
 * mismo que el bundler de Next.js soldaría en un build de test: un test no
 * puede observar los secretos ni las rutas de dev/prod.
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
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/contract/**/*.test.ts",
    ],
    clearMocks: true,
    restoreMocks: true,
  },
});
