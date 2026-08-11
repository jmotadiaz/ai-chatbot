import { afterEach, describe, expect, it, vi } from "vitest";
import { readEnv, resolveSecret } from "../../src/source";

afterEach(() => vi.unstubAllEnvs());

describe("source (costura de lectura)", () => {
  it("readEnv devuelve el valor de process.env", () => {
    vi.stubEnv("CODING_AGENT_WORKER_PORT", "3015");
    expect(readEnv("CODING_AGENT_WORKER_PORT")).toBe("3015");
  });

  it("readEnv devuelve undefined cuando no está definida", () => {
    expect(readEnv("VAR_QUE_NO_EXISTE_12345")).toBeUndefined();
  });

  it("resolveSecret lee de process.env hoy (punto de inyección de systemd)", () => {
    // FUTURO (systemd credentials API): cuando la unidad declare
    // LoadCredential=meta_api_key, systemd expone $CREDENTIALS_DIRECTORY/meta_api_key.
    // La inyección ocurrirá aquí (y en readEnv): si CREDENTIALS_DIRECTORY está
    // definida y ${dir}/${key.toLowerCase()} existe, se lee primero ese archivo.
    vi.stubEnv("META_API_KEY", "sk-test");
    expect(resolveSecret("META_API_KEY")).toBe("sk-test");
  });
});
