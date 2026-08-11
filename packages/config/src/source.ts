/**
 * ÚNICO módulo que lee variables de entorno.
 *
 * FUTURO (systemd credentials API):
 * Para entradas con secret:true, cuando la unidad declare LoadCredential=<name>
 * (p.ej. `LoadCredential=meta_api_key`), systemd expone $CREDENTIALS_DIRECTORY/<name>.
 * Inyección propuesta aquí (aplicar en readEnv y resolveSecret):
 *   const dir = process.env.CREDENTIALS_DIRECTORY;
 *   if (dir) → leer `${dir}/${name.toLowerCase()}` antes de process.env[name]
 * El catálogo (catalog.ts) ya discrimina secret vs no-secret para que el cambio
 * sea local a este archivo; los consumidores (config.*) no cambian.
 */
export function readEnv(name: string): string | undefined {
  return process.env[name];
}

/** Punto único por el que pasan TODOS los secretos. */
export function resolveSecret(name: string): string | undefined {
  return readEnv(name);
}
