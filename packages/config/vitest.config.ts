import { defineConfig } from "vitest/config";
import { initConfig } from "./src/config";

/**
 * Los tests del paquete `config` corren SIEMPRE en el Entorno de Test
 * (ADR 0011 §3.5): la inicialización es explícita al cargar este fichero, no
 * una variable de entorno que un shell pueda arrastrar.
 */
initConfig("test");

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
