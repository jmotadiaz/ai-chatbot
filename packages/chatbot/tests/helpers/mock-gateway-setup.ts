import { ensureMockGateway } from "../mocks/gateway/server";

/**
 * Setup global de vitest (ADR 0010): todo el chatbot habla HTTP con el
 * Model Gateway, así que la suite de tests necesita un Mock Model Gateway
 * disponible antes de cualquier llamada.
 *
 * Cada worker levanta su PROPIO server en un puerto efímero (`port: 0`) y
 * fuerza `MODEL_GATEWAY_URL` a él — antes de que cualquier accessor perezoso
 * de `config` lea la variable — por dos motivos:
 *
 * 1. Un shell que arrastre la MODEL_GATEWAY_URL de otro entorno nunca debe
 *    poder hacer que los tests golpeen LLMs reales.
 * 2. Reutilizar un mock del puerto canónico (`:4001`) entre workers de
 *    vitest tiene carrera: el worker que ganó el bind muere al acabar su
 *    fichero y deja sin server a los que lo reutilizaron (ECONNREFUSED).
 *    Un server efímero por proceso no comparte ciclo de vida con nadie.
 *
 * El server muere con el proceso del worker; no hace falta `stopMockGateway`.
 * El puerto canónico `:4001` sigue siendo el del e2e (`global-setup.ts`) y
 * del contrato del mock (`tests/integration/mocks/gateway.test.ts`).
 */
const handle = await ensureMockGateway({ port: 0 });
process.env.MODEL_GATEWAY_URL = `http://127.0.0.1:${handle.port}`;
process.env.MODEL_GATEWAY_API_KEY ??= "test-gateway-key";
