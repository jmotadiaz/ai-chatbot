import { getSpec, type EnvKey } from "./catalog";
import { ConfigError } from "./errors";
import { readEnv, resolveSecret } from "./source";

export type AccessorKind =
  | "string" | "stringOptional"
  | "secret" | "secretOptional"
  | "int" | "intOptional"
  | "bool";

export interface AccessorRecord {
  key: EnvKey;
  kind: AccessorKind;
}

const REGISTRY: AccessorRecord[] = [];

/** Registro interno de accessors declarados; lo usa config.test para cobertura. */
export function getAccessorRegistry(): AccessorRecord[] {
  return [...REGISTRY];
}

function record(key: EnvKey, kind: AccessorKind): void {
  REGISTRY.push({ key, kind });
}

function raw(key: EnvKey): string | undefined {
  const spec = getSpec(key);
  return spec.secret ? resolveSecret(key) : readEnv(key);
}

function assertType(key: EnvKey, kind: AccessorKind, expected: EnvVarType): void {
  const spec = getSpec(key);
  if (spec.type !== expected) {
    throw new ConfigError(key, `builder ${kind}() usado con type=${spec.type}; esperaba ${expected}`);
  }
}

type EnvVarType = "string" | "number" | "boolean";

export function string(key: EnvKey): () => string {
  const spec = getSpec(key);
  assertType(key, "string", "string");
  record(key, "string");
  return () => {
    const value = raw(key);
    if (value !== undefined) return value;
    if (spec.default !== undefined) return String(spec.default);
    throw new ConfigError(key, `requerida y no definida (${spec.description})`);
  };
}

export function stringOptional(key: EnvKey): () => string | undefined {
  const spec = getSpec(key);
  assertType(key, "stringOptional", "string");
  record(key, "stringOptional");
  return () => {
    const value = raw(key);
    if (value !== undefined) return value;
    return spec.default !== undefined ? String(spec.default) : undefined;
  };
}

export function secret(key: EnvKey): () => string {
  const spec = getSpec(key);
  assertType(key, "secret", "string");
  if (!spec.secret) throw new ConfigError(key, "builder secret() usado con una variable no secreta");
  record(key, "secret");
  return () => {
    const value = resolveSecret(key);
    if (value !== undefined) return value;
    if (spec.default !== undefined) return String(spec.default);
    throw new ConfigError(key, `secreto requerido y no definido (${spec.description})`);
  };
}

export function secretOptional(key: EnvKey): () => string | undefined {
  const spec = getSpec(key);
  assertType(key, "secretOptional", "string");
  if (!spec.secret) throw new ConfigError(key, "builder secretOptional() usado con una variable no secreta");
  record(key, "secretOptional");
  return () => {
    const value = resolveSecret(key);
    if (value !== undefined) return value;
    return spec.default !== undefined ? String(spec.default) : undefined;
  };
}

export function int(key: EnvKey): () => number {
  const spec = getSpec(key);
  assertType(key, "int", "number");
  record(key, "int");
  return () => {
    const value = raw(key);
    if (value !== undefined) {
      const n = Number.parseInt(value, 10);
      if (Number.isNaN(n)) throw new ConfigError(key, `valor "${value}" no es un entero válido`);
      return n;
    }
    if (spec.default !== undefined) return Number(spec.default);
    throw new ConfigError(key, `requerida y no definida (${spec.description})`);
  };
}

export function intOptional(key: EnvKey): () => number | undefined {
  const spec = getSpec(key);
  assertType(key, "intOptional", "number");
  record(key, "intOptional");
  return () => {
    const value = raw(key);
    if (value !== undefined) {
      const n = Number.parseInt(value, 10);
      if (Number.isNaN(n)) throw new ConfigError(key, `valor "${value}" no es un entero válido`);
      return n;
    }
    return spec.default !== undefined ? Number(spec.default) : undefined;
  };
}

export function bool(key: EnvKey): () => boolean {
  const spec = getSpec(key);
  assertType(key, "bool", "boolean");
  record(key, "bool");
  return () => {
    const value = raw(key);
    if (value !== undefined) {
      return spec.truthy !== undefined ? value === spec.truthy : value !== "";
    }
    return spec.default !== undefined ? Boolean(spec.default) : false;
  };
}
