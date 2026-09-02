import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENTORNO_DB, assertDbMatchesEntorno } from "../../src/guardrails";
import { ConfigError } from "../../src/errors";

/**
 * Guardarraíl NEXT_PUBLIC_ENV ↔ POSTGRES_URL (ticket 05). Cada Entorno declara
 * su puerto+DB; cualquier otro DSN es el shell arrastrando la DB de otra
 * corrida. Se valida el literal `puerto/db`, no el host, porque la misma máquina
 * expone las tres DBs y el usuario puede escribir en cualquiera.
 */
describe("assertDbMatchesEntorno", () => {
  const dsnFor = (pair: string) =>
    `postgres://postgres:secret@127.0.0.1:${pair}`;

  // El shell del operador puede exportar NEXT_PUBLIC_ENV (p. ej. prod); la
  // variante sin parametro lo lee via readEnv, asi que cada test lo aísla.
  const savedEnv = process.env.NEXT_PUBLIC_ENV;
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_ENV;
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.NEXT_PUBLIC_ENV;
    else process.env.NEXT_PUBLIC_ENV = savedEnv;
  });

  it("deja pasar el DSN canónico de cada Entorno", () => {
    for (const [entorno, pair] of Object.entries(ENTORNO_DB)) {
      expect(assertDbMatchesEntorno(dsnFor(pair), entorno)).toBe(dsnFor(pair));
    }
  });

  it("falla ante cualquier cruce de Entornos (test↔dev, dev↔prod, test↔prod)", () => {
    const pairs = Object.values(ENTORNO_DB);
    for (const [i, declared] of Object.keys(ENTORNO_DB).entries()) {
      for (const [j, pair] of pairs.entries()) {
        if (i === j) continue;
        expect(() => assertDbMatchesEntorno(dsnFor(pair), declared)).toThrow(
          ConfigError,
        );
        expect(() => assertDbMatchesEntorno(dsnFor(pair), declared)).toThrow(
          new RegExp(ENTORNO_DB[declared]),
        );
      }
    }
  });

  it("falla con la DB legendaria compartida (5432/main)", () => {
    expect(() =>
      assertDbMatchesEntorno(dsnFor("5432/main"), "prod"),
    ).toThrow(ConfigError);
  });

  it("no declara entorno (ausente, vacío o desconocido) → pasa tal cual", () => {
    const url = dsnFor("5432/anything");
    expect(assertDbMatchesEntorno(url, undefined)).toBe(url);
    expect(assertDbMatchesEntorno(url)).toBe(url); // readEnv: sin NEXT_PUBLIC_ENV
    expect(assertDbMatchesEntorno(url, "")).toBe(url);
    expect(assertDbMatchesEntorno(url, "   ")).toBe(url);
    expect(assertDbMatchesEntorno(url, "evals")).toBe(url);
  });

  it("sin parametro, lee NEXT_PUBLIC_ENV del entorno (costura del accessor)", () => {
    process.env.NEXT_PUBLIC_ENV = "test";
    const dev = dsnFor("5433/dev");
    expect(() => assertDbMatchesEntorno(dev)).toThrow(ConfigError);
    expect(assertDbMatchesEntorno(dsnFor("5434/test"))).toBe(dsnFor("5434/test"));
  });

  it("el mensaje nombra el Entorno declarado, el DSN esperado y el obtenido", () => {
    expect(() => assertDbMatchesEntorno(dsnFor("5435/prod"), "dev")).toThrow(
      /NEXT_PUBLIC_ENV=dev[\s\S]*5433\/dev[\s\S]*5435\/prod/,
    );
  });
});
