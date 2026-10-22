import { ConfigError } from "./errors";
import type { AppConfig, Entorno } from "./types";

/**
 * Guardarraíles de coherencia Entorno ↔ base de datos / Model Gateway
 * (ADR 0001, ADR 0010 y ADR 0011).
 *
 * Cada Entorno declara su propia DB aislada y su propio puerto de Gateway en
 * el MISMO módulo `config.<env>.ts` que su DSN. Un DSN que no coincide con el
 * Entorno declarado significa que alguien copió la credencial de otro Entorno
 * — escribir ahí es exactamente el accidente que este diseño existe para
 * impedir, así que el bundle falla antes de abrir la primera conexión.
 *
 * A diferencia del diseño anterior (ADR 0005), el Entorno es SIEMPRE un
 * parámetro explícito: este módulo no lee `process.env` ni ninguna variable de
 * selección.
 */
export const ENTORNO_DB: Record<Entorno, string> = {
  test: "5434/test",
  dev: "5433/dev",
  prod: "5435/prod",
};

/**
 * Solo test declara puerto esperado: dev y prod comparten hoy el mismo
 * Gateway local (`:4000`). Un test que hable contra `:4000` golpearía LLMs
 * reales con credenciales reales.
 */
export const ENTORNO_GATEWAY_PORT: Partial<Record<Entorno, string>> = {
  test: "4001",
};

/** Falla si el DSN no apunta a la DB aislada del Entorno declarado. */
export function assertDbMatchesEntorno(
  url: string,
  entorno: Entorno | string,
): string {
  const expected = ENTORNO_DB[entorno as Entorno];
  if (!expected) return url;
  if (!url.includes(expected)) {
    throw new ConfigError(
      "postgresUrl",
      `El Entorno ${entorno} exige el DSN de su DB aislada (${expected}); ` +
        `obtenido "${redactDsn(url)}". Revisa packages/config/src/secrets.${entorno}.ts.`,
    );
  }
  return url;
}

/** Falla si la URL del Gateway no apunta al puerto aislado del Entorno. */
export function assertGatewayMatchesEntorno(
  url: string,
  entorno: Entorno | string,
): string {
  const expectedPort = ENTORNO_GATEWAY_PORT[entorno as Entorno];
  if (!expectedPort) return url;
  const port = /:(\d+)(?=[/?]|$)/.exec(url)?.[1];
  if (port !== expectedPort) {
    throw new ConfigError(
      "modelGatewayUrl",
      `El Entorno ${entorno} exige el Mock Model Gateway (puerto ${expectedPort}); ` +
        `obtenida "${url}". Revisa packages/config/src/config.${entorno}.ts.`,
    );
  }
  return url;
}

/** No filtramos credenciales en el mensaje de error (solo esquema/host). */
function redactDsn(url: string): string {
  return url.replace(/\/\/[^@/]*@/, "//***@");
}

/**
 * Valida un bundle completo y lo devuelve tal cual. La usan los tres
 * `env.<env>.ts`: si un `SecretsConfig` cruzado se importa por error, el
 * proceso no arranca (fallo en runtime, además del fallo en `tsc` por tipos).
 */
export function validateAppConfig(candidate: AppConfig): AppConfig {
  assertDbMatchesEntorno(candidate.postgresUrl, candidate.entorno);
  assertGatewayMatchesEntorno(candidate.modelGatewayUrl, candidate.entorno);
  return candidate;
}
