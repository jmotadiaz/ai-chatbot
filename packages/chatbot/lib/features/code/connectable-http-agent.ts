import {
  AbstractAgent,
  runHttpRequest,
  transformHttpEventStream,
  type RunAgentInput,
  type BaseEvent,
  type Message,
} from "@ag-ui/client";
import { Observable } from "rxjs";

export interface ConnectableHttpAgentConfig {
  runUrl: string;
  connectUrl: string;
  threadId: string;
  initialMessages?: Message[];
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export class ConnectableHttpAgent extends AbstractAgent {
  private runUrl: string;
  private connectUrl: string;
  private headers: Record<string, string>;
  private fetchImpl: typeof fetch;

  constructor(config: ConnectableHttpAgentConfig) {
    super({
      threadId: config.threadId,
      initialMessages: config.initialMessages ?? [],
    });
    this.runUrl = config.runUrl;
    this.connectUrl = config.connectUrl;
    this.headers = config.headers ?? {};
    this.fetchImpl = config.fetch ?? ((u, init) => fetch(u, init));
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return this.httpStream(this.runUrl, input);
  }

  connect(input: RunAgentInput): Observable<BaseEvent> {
    return this.httpStream(this.connectUrl, input);
  }

  private httpStream(url: string, input: RunAgentInput): Observable<BaseEvent> {
    const http$ = runHttpRequest(() =>
      this.fetchImpl(url, {
        method: "POST",
        headers: { ...this.headers, "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(input),
      }),
    );
    return transformHttpEventStream(http$, this.debugLogger);
  }
}
