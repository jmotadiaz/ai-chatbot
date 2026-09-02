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
