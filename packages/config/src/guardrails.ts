import { readEnv } from "./source";
import { ConfigError } from "./errors";

/**
 * Guardarraíl de coherencia Entorno ↔ base de datos (ADR 0001, ticket 05).
 *
 * Cada Entorno tiene su propia DB aislada (test↔5434/test, dev↔5433/dev,
 * prod↔5435/prod). Un `POSTGRES_URL` que no coincide con el `NEXT_PUBLIC_ENV`
 * declarado significa que el shell arrastró el DSN de otro Entorno — escribir
 * ahí es exactamente el accidente que este esfuerzo existe para impedir, así
 * que fallamos antes de abrir la primera conexión.
 *
 * Pureza a propósito: el Entorno puede pasarse explícito (tests, o el e2e
 * global setup que siempre es test) o leerse vía `readEnv` — el único módulo
 * que toca `process.env`. `NEXT_PUBLIC_*` queda fuera del catálogo tipado por
 * construcción (Next la inlinea en build); como clave dinámica documentada en
 * `DYNAMIC_ENV_KEYS`, se lee con `readEnv`. Con entorno no declarado o
 * desconocido (`evals`, runners sin env) no hay nada que cruzar: se pasa tal
 * cual.
 */
export const ENTORNO_DB: Record<string, string> = {
  test: "5434/test",
  dev: "5433/dev",
  prod: "5435/prod",
};

export function assertDbMatchesEntorno(
  url: string,
  entorno?: string,
): string {
  const declared = (entorno ?? readEnv("NEXT_PUBLIC_ENV"))?.trim();
  if (!declared || !(declared in ENTORNO_DB)) return url;
  const expected = ENTORNO_DB[declared];
  if (!url.includes(expected)) {
    throw new ConfigError(
      "POSTGRES_URL",
      `NEXT_PUBLIC_ENV=${declared} exige el DSN de su DB aislada (${expected}); ` +
        `obtenido "${url}". El shell probablemente arrastró el POSTGRES_URL de otro Entorno — ` +
        "usa `dotenv -o -e .env.<entorno>` o levanta el entorno con `pnpm dev`/`pnpm test:e2e`.",
    );
  }
  return url;
}

/**
 * Guardarraíl de coherencia Entorno ↔ Model Gateway (ADR 0010, ticket 02).
 *
 * En test, `MODEL_GATEWAY_URL` debe apuntar al **Mock Model Gateway**
 * (`packages/chatbot/tests/mocks/gateway/`, puerto `4001`): un test que hable
 * contra el `:4000` de dev/prod golpearía LLMs reales con credenciales reales —
 * exactamente el cruce de Entornos que este esfuerzo existe para impedir.
 * Solo test declara puerto esperado: dev y prod comparten hoy el mismo Gateway
 * local (`:4000`), y un entorno no declarado o desconocido (`evals`, runners
 * sin env) no tiene nada que cruzar — se pasa tal cual.
 *
 * Misma pureza que `assertDbMatchesEntorno`: el Entorno puede pasarse explícito
 * (tests) o leerse vía `readEnv` (la única costura con `process.env`).
 */
export const ENTORNO_GATEWAY_PORT: Record<string, string> = {
  test: "4001",
};

export function assertGatewayMatchesEntorno(
  url: string,
  entorno?: string,
): string {
  const declared = (entorno ?? readEnv("NEXT_PUBLIC_ENV"))?.trim();
  if (!declared || !(declared in ENTORNO_GATEWAY_PORT)) return url;
  const expectedPort = ENTORNO_GATEWAY_PORT[declared];
  const port = /:(\d+)(?=[/?]|$)/.exec(url)?.[1];
  if (port !== expectedPort) {
    throw new ConfigError(
      "MODEL_GATEWAY_URL",
      `NEXT_PUBLIC_ENV=${declared} exige el Mock Model Gateway (puerto ${expectedPort}); ` +
        `obtenida "${url}". El shell probablemente arrastró la MODEL_GATEWAY_URL de otro Entorno — ` +
        "usa `dotenv -o -e .env.test` o levanta el entorno con `pnpm test:e2e`.",
    );
  }
  return url;
}
