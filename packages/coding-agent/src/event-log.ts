import type { BaseEvent } from "./pi-to-agui-translator";
import { buildReconnectPrelude } from "./reconnect-prelude";
import { compactReplayEvents } from "./replay-compaction";

export interface LoggedAguiEvent {
  epoch: string;
  seq: number;
  event: BaseEvent;
}

/**
 * Read position in the log. Same shape as the `SessionCursor` the HTTP
 * border emits via `getSessionSnapshot`; seq values are meaningful only
 * within the epoch.
 */
export interface Cursor {
  epoch: string;
  seq: number;
}

type Subscriber = (entry: LoggedAguiEvent) => void;

export class SessionEventLog {
  /**
   * Identifies this in-memory incarnation of the log. Sequence numbers are
   * meaningful only within an epoch: a worker restart creates a new log and
   * therefore a new epoch.
   */
  readonly epoch = crypto.randomUUID();
  private events: LoggedAguiEvent[] = [];
  private subscribers = new Set<Subscriber>();
  private nextSeq = 1;

  append(event: BaseEvent): LoggedAguiEvent {
    const entry = { epoch: this.epoch, seq: this.nextSeq, event };
    this.nextSeq += 1;
    this.events.push(entry);

    for (const subscriber of this.subscribers) {
      subscriber(entry);
    }

    return entry;
  }

  readAfter(seq: number): LoggedAguiEvent[] {
    return this.events.filter((entry) => entry.seq > seq);
  }

  readUpTo(seq: number): LoggedAguiEvent[] {
    return this.events.filter((entry) => entry.seq <= seq);
  }

  /**
   * Reconnect seam: everything a client needs to re-attach at `cursor`.
   *
   * Returns the synthetic prelude (tool calls/steps that were cut open at
   * the cursor, re-opened for the AG-UI verifier) and the replayed tail
   * with consecutive streaming deltas compacted. Emission order is always
   * prelude → events.
   *
   * Seq policy (contract):
   * - prelude entries are stamped with `cursor.seq`: synthetic events do
   *   NOT advance the cursor — the AG-UI verifier rejects a reconnect
   *   whose first real event does not immediately follow the client's
   *   last delivered seq.
   * - events keep the seq of the LAST merged delta: the cursor advances
   *   past every compacted entry, so a later disconnect never replays
   *   content that was already sent merged.
   *
   * Throws when `cursor.epoch` does not match this log's epoch. The
   * caller must surface that error on the stream (not as a JSON-RPC
   * error), preserving the current client-visible behavior.
   */
  replayAfter(cursor: Cursor): { prelude: LoggedAguiEvent[]; events: LoggedAguiEvent[] } {
    if (cursor.epoch !== this.epoch) {
      throw new Error("Cursor epoch mismatch");
    }
    const prefix = this.events.filter((entry) => entry.seq <= cursor.seq);
    const tail = this.events.filter((entry) => entry.seq > cursor.seq);
    return {
      prelude: buildReconnectPrelude(prefix).map((event) => ({
        epoch: this.epoch,
        seq: cursor.seq,
        event,
      })),
      events: compactReplayEvents(tail),
    };
  }

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  get lastSeq(): number {
    return this.nextSeq - 1;
  }

  get size(): number {
    return this.events.length;
  }
}
