import { EventType, type BaseEvent } from "@ag-ui/client";

export const CODING_AGENT_CURSOR_EVENT = "coding_agent_cursor";

interface LoggedAguiEnvelope {
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
  terminalSeen: boolean;
  lastSeq?: number;
  aguiEventCounts: Record<string, number>;
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
  const { seq, event } = value;
  if (typeof seq !== "number" || !isObject(event) || typeof event.type !== "string") {
    return null;
  }
  return { seq, event: event as BaseEvent };
}

function cursorEvent(seq: number): BaseEvent {
  return {
    type: EventType.CUSTOM,
    name: CODING_AGENT_CURSOR_EVENT,
    value: { seq },
    timestamp: Date.now(),
  } as BaseEvent;
}

function isTerminalEvent(event: BaseEvent): boolean {
  return event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR;
}

export function parseAfterSeq(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return 0;
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
}): Promise<RelaySummary> {
  const {
    workerStream,
    controller,
    encoder,
    log,
    onReader,
    skipEvent,
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
    terminalSeen: false,
    aguiEventCounts: {},
  };

  const emitCursor = (seq: number) => {
    emitAguiSseEvent(controller, encoder, cursorEvent(seq));
    summary.emittedCursorEventCount += 1;
    summary.lastSeq = seq;
  };

  const processLine = (line: string) => {
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
      emitCursor(envelope.seq);
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
      emitCursor(envelope.seq);
    }
    emitAguiSseEvent(controller, encoder, envelope.event);
    if (!terminalEvent) {
      emitCursor(envelope.seq);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      processLine(line);
    }
  }

  if (buffer.trim()) {
    processLine(buffer);
  }

  return summary;
}
