import {
  MOCK_GATEWAY_PORT,
  ensureMockGateway,
  stopMockGateway,
} from "../mocks/gateway/server";

/**
 * GlobalSetup de Vitest (ADR 0010/0011): todo el chatbot habla HTTP con el
 * Model Gateway, así que la suite necesita el Mock Model Gateway disponible
 * ANTES de cualquier test — y en el puerto CANÓNICO `:4001`, que es el que
 * `config.modelGatewayUrl()` devuelve en el Entorno de Test (el bundle estático
 * está congelado: mutar `process.env.MODEL_GATEWAY_URL` ya no tiene efecto
 * alguno, que era justo el truco del antiguo `tests/helpers/mock-gateway-setup.ts`).
 *
 * Por qué `globalSetup` (proceso principal) y no `setupFiles` (cada worker):
 *
 * 1. El server vive en el proceso principal con ciclo de vida propio: sube
 *    con la corrida y baja con el `teardown` devuelto aquí, sin compartir
 *    proceso con ningún worker (un worker que muriera no dejaba sin server a
 *    los demás).
 * 2. `setupFiles` importaba `node:http` vía `mocks/gateway/server`, y los
 *    ficheros de component tests con `@vitest-environment jsdom` fallaban en
 *    colección con `No such built-in module: node:` (FIXME del hook
 *    pre-commit). El mock ya no pasa por los workers jsdom.
 * 3. Sin `process.env`: la única fuente de configuración es el bundle de test.
 *
 * `ensureMockGateway` es idempotente y seguro frente a corridas concurrentes
 * (reutiliza un mock ya sondeable, p. ej. el del global-setup de Playwright);
 * `stopMockGateway` solo cierra el server que ESTE proceso abrió.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const handle = await ensureMockGateway({ port: MOCK_GATEWAY_PORT });
  console.log(
    `[global-setup] Mock Model Gateway ${handle.started ? "started" : "reused"} on :${handle.port}`,
  );
  return async () => {
    await stopMockGateway();
  };
}
