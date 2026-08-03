import { FileTraceSink, type FileTraceSinkOptions } from "./sink";
import { isTracingEnabled } from "./types";

interface RegistryEntry {
  sink: FileTraceSink;
  refCount: number;
}

const registry = new Map<string, RegistryEntry>();

/**
 * Open — or join — the sink for `runId` and take a reference to it. The sink
 * lives as long as its references do, so a run's trace is not tied to the
 * lifetime of the single request that happened to open it.
 *
 * Returns null when tracing is disabled.
 */
export async function acquireTraceSink(
  opts: FileTraceSinkOptions,
): Promise<FileTraceSink | null> {
  if (!isTracingEnabled()) return null;

  const existing = registry.get(opts.runId);
  if (existing) {
    existing.refCount += 1;
    return existing.sink;
  }

  const sink = new FileTraceSink(opts);
  registry.set(opts.runId, { sink, refCount: 1 });
  await sink.open();
  return sink;
}

/**
 * Take an extra reference on an already-acquired run sink and get its release
 * back. Work that outlives the request which opened the run — a detached agent
 * turn that keeps executing tools after the browser disconnects — holds one of
 * these so the request handler's release does not close the sink out from
 * under it. No-op for an untraced run.
 */
export function retainTraceSink(runId: string): () => Promise<void> {
  const entry = registry.get(runId);
  if (!entry) return async () => {};

  entry.refCount += 1;
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await releaseTraceSink(runId);
  };
}

/** Drop one reference; the last one out flushes and closes the sink. */
export async function releaseTraceSink(runId: string): Promise<void> {
  const entry = registry.get(runId);
  if (!entry) return;

  entry.refCount -= 1;
  if (entry.refCount > 0) return;

  registry.delete(runId);
  await entry.sink.close();
}

/** Test seam: number of live references on a run's sink (0 when closed). */
export function traceSinkRefCount(runId: string): number {
  return registry.get(runId)?.refCount ?? 0;
}
