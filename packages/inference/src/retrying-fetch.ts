export interface RetryingFetchOptions {
  /** Reintentos extra tras el primer intento (por defecto 3). */
  retries?: number;
  /** Base del backoff exponencial: 500ms, 1s, 2s, … (capped por retries). */
  baseDelayMs?: number;
  /** Inyectable en tests; por defecto un setTimeout cancelable por signal. */
  sleep?: (ms: number, signal?: AbortSignal | null) => Promise<void>;
}

const defaultSleep = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Request aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Request aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/**
 * OpenCode Go devuelve 503 "Endpoint is unavailable" de forma transitoria en
 * el edge (sobre todo con los modelos stealth gratis bajo carga) y
 * @ai-sdk/anthropic solo marca reintentables los errores `overloaded_error`,
 * así que el `maxRetries` del AI SDK no cubre ese caso. Este wrapper reintenta
 * cualquier 5xx con backoff exponencial antes de devolver la respuesta; el
 * body de las peticiones del SDK es un JSON ya serializado, así que repetir el
 * mismo `init` es seguro.
 */
export function createRetryingFetch(
  baseFetch: typeof fetch,
  {
    retries = 3,
    baseDelayMs = 500,
    sleep = defaultSleep,
  }: RetryingFetchOptions = {},
): typeof fetch {
  return async (input, init) => {
    for (let attempt = 0; ; attempt++) {
      const response = await baseFetch(input, init);
      if (
        response.status < 500 ||
        attempt >= retries ||
        init?.signal?.aborted
      ) {
        return response;
      }
      await response.body?.cancel().catch(() => {});
      await sleep(baseDelayMs * 2 ** attempt, init?.signal);
    }
  };
}
