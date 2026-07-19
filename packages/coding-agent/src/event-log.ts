import type { BaseEvent } from "./pi-to-agui-translator";

export interface LoggedAguiEvent {
  epoch: string;
  seq: number;
  event: BaseEvent;
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
