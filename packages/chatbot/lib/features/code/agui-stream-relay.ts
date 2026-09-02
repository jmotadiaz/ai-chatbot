import { EventType, type BaseEvent } from "@ag-ui/client";
import { CODING_AGENT_CURSOR_EVENT as AGENT_CURSOR_EVENT } from "coding-agent/agui/event";
export const CODING_AGENT_CURSOR_EVENT = AGENT_CURSOR_EVENT;

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
  droppedEventCount: number;
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
    name: AGENT_CURSOR_EVENT,
    value: { seq, ...(epoch ? { epoch } : {}), ...(terminal ? { terminal: true } : {}) },
    timestamp: Date.now(),
  } as unknown as BaseEvent;
}

function isTerminalEvent(event: BaseEvent): boolean {
  return event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR;
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
}): Promise<RelaySummary> {
  const { workerStream, controller, encoder, log, onReader } = options;
  const reader = workerStream.getReader();
  onReader?.(reader);

  const decoder = new TextDecoder();
  let buffer = "";
  const summary: RelaySummary = {
    emittedAguiEventCount: 0,
    emittedCursorEventCount: 0,
    droppedEventCount: 0,
    malformedLineCount: 0,
    terminalSeen: false,
    aguiEventCounts: {},
  };

  const emitCursor = (seq: number, epoch?: string, terminal = false) => {
    emitAguiSseEvent(controller, encoder, cursorEvent(seq, epoch, terminal));
    summary.emittedCursorEventCount += 1;
    summary.lastSeq = seq;
  };

  // AG-UI's run state machine forbids every event (including CUSTOM) after
  // RUN_ERROR, and only tolerates RUN_ERROR/RUN_STARTED after RUN_FINISHED.
  // Between a terminal and the next RUN_STARTED the relay therefore emits
  // nothing but the mandatory events themselves; once a RUN_STARTED re-opens
  // the run, cursors resume. The dropped events' seqs are recovered because
  // the RUN_STARTED's cursor jumps past them.
  let awaitingRunRestart = false;

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

    const isTerminal = isTerminalEvent(envelope.event);

    if (isTerminal) {
      if (awaitingRunRestart) {
        // A second terminal with no RUN_STARTED in between would deadlock the
        // AG-UI client (RUN_ERROR locks the run; anything after RUN_FINISHED
        // is rejected). Drop it; the client resyncs from a snapshot/replay.
        summary.droppedEventCount += 1;
        log.warn("stream.duplicate_terminal_dropped", {
          seq: envelope.seq,
          aguiType: envelope.event.type,
        });
        return;
      }
      incrementCount(summary.aguiEventCounts, envelope.event.type);
      summary.emittedAguiEventCount += 1;
      summary.terminalSeen = true;
      awaitingRunRestart = true;
      // AG-UI forbids every event, including CUSTOM, after a terminal event.
      // Mark this cursor as pending; the client promotes it only after it
      // applies RUN_FINISHED/RUN_ERROR.
      emitCursor(envelope.seq, envelope.epoch, true);
      emitAguiSseEvent(controller, encoder, envelope.event);
      return;
    }

    if (envelope.event.type === EventType.RUN_STARTED) {
      awaitingRunRestart = false;
    } else if (awaitingRunRestart) {
      // Non-RUN_STARTED events after a terminal are rejected by AG-UI; drop
      // them until the run is re-opened.
      summary.droppedEventCount += 1;
      log.warn("stream.event_after_terminal_dropped", {
        seq: envelope.seq,
        aguiType: envelope.event.type,
      });
      return;
    }

    incrementCount(summary.aguiEventCounts, envelope.event.type);
    summary.emittedAguiEventCount += 1;
    log.debug("stream.event", {
      seq: envelope.seq,
      aguiType: envelope.event.type,
      stepName: (envelope.event as { stepName?: string }).stepName,
      toolCallId: (envelope.event as { rawEvent?: { toolCallId?: string } }).rawEvent?.toolCallId,
    });

    emitAguiSseEvent(controller, encoder, envelope.event);
    emitCursor(envelope.seq, envelope.epoch);
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
