/**
 * Flags de Entorno puros (sin `node:*): seguros para importar desde código que
 * termina en el bundle del cliente (p. ej. providers.ts → chat.tsx). La
 * resolución del FICHERO de entorno vive en `env-file.ts`, que sí usa
 * `node:path`/`node:url` y solo puede importarse desde server/scripts.
 */
export const isTestMode = (): boolean =>
  process.env.NEXT_PUBLIC_ENV === "test";

export const isEvalMode = (): boolean =>
  process.env.NEXT_PUBLIC_ENV === "evals";
