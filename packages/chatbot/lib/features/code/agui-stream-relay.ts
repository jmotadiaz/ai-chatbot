import { EventType, type BaseEvent } from "@ag-ui/client";

export const CODING_AGENT_CURSOR_EVENT = "coding_agent_cursor";

interface LoggedAguiEnvelope {
  epoch?: string;
  seq: number;
  event: BaseEvent;
}

interface RelayLogger {
  debug(message: string, payload?: Record<string, unknown>): void;
  warn(message: string, payload?: Record<string, unknown>): void;
}

export interface RelaySummary {
  emittedAguiEventCount: number;
  emittedCursorEventCount: number;
  skippedAguiEventCount: number;
  malformedLineCount: number;
  /** Number of times a burst was yielded so the browser can paint. */
  burstYieldCount: number;
  terminalSeen: boolean;
  lastSeq?: number;
  aguiEventCounts: Record<string, number>;
}

export interface BurstPacingOptions {
  /** Disabled by default so callers opt in only for browser-facing streams. */
  enabled: boolean;
  /** Deltas received within this window belong to the same upstream burst. */
  windowMs?: number;
  /** Let the browser paint after this many consecutive burst deltas. */
  batchSize?: number;
  /** A frame-sized pause between batches. */
  yieldMs?: number;
}

function incrementCount(counts: Record<string, number>, key: string | undefined): void {
  if (!key) return;
  counts[key] = (counts[key] ?? 0) + 1;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEnvelope(value: unknown): LoggedAguiEnvelope | null {
  if (!isObject(value)) return null;
  const { epoch, seq, event } = value;
  if (typeof seq !== "number" || !isObject(event) || typeof event.type !== "string") {
    return null;
  }
  return {
    ...(typeof epoch === "string" ? { epoch } : {}),
    seq,
    event: event as BaseEvent,
  };
}

function cursorEvent(seq: number, epoch?: string, terminal = false): BaseEvent {
  return {
    type: EventType.CUSTOM,
    name: CODING_AGENT_CURSOR_EVENT,
    value: { seq, ...(epoch ? { epoch } : {}), ...(terminal ? { terminal: true } : {}) },
    timestamp: Date.now(),
  } as BaseEvent;
}

function isTerminalEvent(event: BaseEvent): boolean {
  return event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR;
}

function isVisualDeltaEvent(event: BaseEvent): boolean {
  return (
    event.type === EventType.TEXT_MESSAGE_CHUNK ||
    event.type === EventType.REASONING_MESSAGE_CHUNK
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseAfterSeq(value: unknown): number {
  return parseAfterSeqOrUndefined(value) ?? 0;
}

/**
 * Like `parseAfterSeq`, but returns `undefined` instead of defaulting to 0
 * when the caller didn't send a valid cursor. Used by the connect route so
 * an absent (or malformed) `afterSeq` is forwarded to the worker as
 * "not provided" rather than as an explicit request to replay the entire
 * session log — the worker computes a better default (the last run's
 * window) when it doesn't receive an explicit cursor.
 */
export function parseAfterSeqOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return undefined;
}

export function emitAguiSseEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: BaseEvent,
): void {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

export async function relayLoggedAguiNdjsonToSse(options: {
  workerStream: ReadableStream<Uint8Array>;
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  log: RelayLogger;
  onReader?: (reader: ReadableStreamDefaultReader<Uint8Array>) => void;
  skipEvent?: (event: BaseEvent) => boolean;
  /**
   * Pi providers occasionally deliver hundreds of text/reasoning deltas in
   * one event-loop turn. Yielding between bounded batches lets the browser
   * render the already-received content instead of painting it all at once.
   */
  burstPacing?: BurstPacingOptions;
}): Promise<RelaySummary> {
  const {
    workerStream,
    controller,
    encoder,
    log,
    onReader,
    skipEvent,
    burstPacing,
  } = options;
  const reader = workerStream.getReader();
  onReader?.(reader);

  const decoder = new TextDecoder();
  let buffer = "";
  const summary: RelaySummary = {
    emittedAguiEventCount: 0,
    emittedCursorEventCount: 0,
    skippedAguiEventCount: 0,
    malformedLineCount: 0,
    burstYieldCount: 0,
    terminalSeen: false,
    aguiEventCounts: {},
  };

  const burstWindowMs = burstPacing?.windowMs ?? 8;
  const burstBatchSize = burstPacing?.batchSize ?? 16;
  const burstYieldMs = burstPacing?.yieldMs ?? 16;
  let previousVisualDeltaAt = 0;
  let consecutiveVisualDeltas = 0;

  const emitCursor = (seq: number, epoch?: string, terminal = false) => {
    emitAguiSseEvent(controller, encoder, cursorEvent(seq, epoch, terminal));
    summary.emittedCursorEventCount += 1;
    summary.lastSeq = seq;
  };

  const maybeYieldForBurst = async (event: BaseEvent) => {
    if (!burstPacing?.enabled || !isVisualDeltaEvent(event)) {
      consecutiveVisualDeltas = 0;
      return;
    }

    const now = Date.now();
    consecutiveVisualDeltas =
      now - previousVisualDeltaAt <= burstWindowMs
        ? consecutiveVisualDeltas + 1
        : 1;
    previousVisualDeltaAt = now;

    if (consecutiveVisualDeltas % burstBatchSize === 0) {
      summary.burstYieldCount += 1;
      await wait(burstYieldMs);
    }
  };

  const processLine = async (line: string) => {
    if (!line.trim()) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      summary.malformedLineCount += 1;
      log.warn("stream.malformed", { line: line.slice(0, 500) });
      return;
    }

    const envelope = parseEnvelope(parsed);
    if (!envelope) {
      summary.malformedLineCount += 1;
      log.warn("stream.malformed_envelope", { line: line.slice(0, 500) });
      return;
    }

    const shouldSkip = skipEvent?.(envelope.event) ?? false;
    if (shouldSkip) {
      summary.skippedAguiEventCount += 1;
      emitCursor(envelope.seq, envelope.epoch);
      consecutiveVisualDeltas = 0;
      return;
    }

    incrementCount(summary.aguiEventCounts, envelope.event.type);
    summary.emittedAguiEventCount += 1;
    const terminalEvent = isTerminalEvent(envelope.event);
    summary.terminalSeen ||= terminalEvent;
    log.debug("stream.event", {
      seq: envelope.seq,
      aguiType: envelope.event.type,
      stepName: (envelope.event as { stepName?: string }).stepName,
      toolCallId: (envelope.event as { rawEvent?: { toolCallId?: string } }).rawEvent?.toolCallId,
    });

    if (terminalEvent) {
      // AG-UI forbids every event, including CUSTOM, after a terminal event.
      // Mark this cursor as pending; the client promotes it only after it
      // applies RUN_FINISHED/RUN_ERROR.
      emitCursor(envelope.seq, envelope.epoch, true);
    }
    emitAguiSseEvent(controller, encoder, envelope.event);
    if (!terminalEvent) {
      emitCursor(envelope.seq, envelope.epoch);
      await maybeYieldForBurst(envelope.event);
    } else {
      consecutiveVisualDeltas = 0;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      await processLine(line);
    }
  }

  if (buffer.trim()) {
    await processLine(buffer);
  }

  return summary;
}
