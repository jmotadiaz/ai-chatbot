/**
 * Resolución portable de rutas del monorepo (ADR 0011 §3.3).
 *
 * `REPO_ROOT` se descubre subiendo directorios desde la ubicación de ESTE
 * módulo (`import.meta.url`) hasta encontrar `pnpm-workspace.yaml`, con fallback
 * a la subida fija de tres niveles (`packages/config/src` → raíz). Ninguna
 * ruta de la configuración hardcodea el home del host.
 *
 * A propósito NO importa `node:path`/`node:fs`/`node:url`: este módulo forma
 * parte del grafo que el bundler de Next.js enlaza en el bundle de cliente
 * (`config.entorno()` es seguro en Client Components). Las operaciones de
 * fichero se resuelven con `process.getBuiltinModule("node:fs")` y solo cuando
 * existe un runtime Node; en el navegador las rutas se calculan igual (nunca se
 * usan) y no se toca el sistema de ficheros.
 */

/** Directorio de `src/paths.ts` (con `/` final eliminado). */
function moduleDir(): string {
  try {
    const here = new URL(".", import.meta.url);
    if (here.protocol !== "file:") return "";
    return decodeURIComponent(here.pathname).replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function getBuiltinModule(): ((id: string) => unknown) | undefined {
  if (typeof process === "undefined") return undefined;
  const fn = (process as unknown as Record<string, unknown>)["getBuiltinModule"];
  return typeof fn === "function" ? (fn as (id: string) => unknown) : undefined;
}

/** `node:fs` cuando corremos en Node; `undefined` en el bundle de cliente. */
function nodeFs(): { existsSync(path: string): boolean } | undefined {
  const getBuiltin = getBuiltinModule();
  if (!getBuiltin) return undefined;
  try {
    return getBuiltin("node:fs") as { existsSync(path: string): boolean };
  } catch {
    return undefined;
  }
}

/** `node:os` cuando corremos en Node; `undefined` en el bundle de cliente. */
function nodeOs(): { homedir(): string } | undefined {
  const getBuiltin = getBuiltinModule();
  if (!getBuiltin) return undefined;
  try {
    return getBuiltin("node:os") as { homedir(): string };
  } catch {
    return undefined;
  }
}

/**
 * Normaliza una ruta POSIX sin tocar el sistema de ficheros: colapsa `//`,
 * resuelve `.` y `..` y conserva la raíz absoluta. El monorepo solo se ejecuta
 * en Linux (prod/dev/test son procesos Node locales), así que no hace falta
 * normalización win32.
 */
export function normalizePath(input: string): string {
  const absolute = input.startsWith("/");
  const parts: string[] = [];
  for (const segment of input.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") parts.pop();
      else if (!absolute) parts.push("..");
      continue;
    }
    parts.push(segment);
  }
  const joined = parts.join("/");
  if (absolute) return `/${joined}`;
  return joined || ".";
}

/** `path.resolve(...parts)` POSIX: un segmento absoluto reinicia la ruta. */
export function resolvePath(...parts: string[]): string {
  let out = "";
  for (const part of parts) {
    if (!part) continue;
    out = part.startsWith("/") ? part : `${out}/${part}`;
  }
  return normalizePath(out || ".");
}

/**
 * Override opcional de la raíz del repo (ADR 0011). NO selecciona Entorno ni
 * puertos: solo permite apuntar la resolución de ficheros a otra copia del
 * monorepo (p. ej. un worktree) cuando el operador lo declara explícitamente.
 */
function declaredRepoRoot(): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env?.REPO_ROOT?.trim();
  return value ? value : undefined;
}

function discoverRepoRoot(): string {
  const declared = declaredRepoRoot();
  if (declared) return normalizePath(declared);

  const start = moduleDir();
  const fs = nodeFs();
  if (start && fs) {
    let dir = start;
    // packages/config/src → … → raíz (el límite lo pone el sistema de ficheros).
    for (;;) {
      if (fs.existsSync(`${dir}/pnpm-workspace.yaml`)) return dir || "/";
      const parent = dir.replace(/\/[^/]+$/, "");
      if (!parent || parent === dir) break;
      dir = parent;
    }
  }

  // Fallback: `packages/config/src` → raíz del monorepo.
  return start ? resolvePath(start, "../../..") : resolvePath(".");
}

/** Raíz absoluta del monorepo. */
export const REPO_ROOT: string = discoverRepoRoot();

/** Ruta absoluta dentro de la raíz del monorepo. */
export function repoPath(...segments: string[]): string {
  return resolvePath(REPO_ROOT, ...segments);
}

export type PackageName = "chatbot" | "coding-agent" | "config" | "tracing";

/** Ruta absoluta dentro de `packages/<pkg>`. */
export function packagePath(pkg: PackageName, ...segments: string[]): string {
  return resolvePath(REPO_ROOT, "packages", pkg, ...segments);
}

/**
 * Ruta dentro del home del usuario sin `node:os` en el grafo de cliente.
 * Existe solo para la excepción histórica de Producción (ADR 0002): las
 * rutas de sesiones de prod quedan fuera de `repoPath`.
 */
export function homePath(...segments: string[]): string {
  const home = nodeOs()?.homedir() ?? "";
  return resolvePath(home || "/", ...segments);
}
