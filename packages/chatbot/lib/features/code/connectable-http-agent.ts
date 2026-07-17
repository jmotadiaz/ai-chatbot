import {
  AbstractAgent,
  runHttpRequest,
  transformHttpEventStream,
  type RunAgentInput,
  type Message,
} from "@ag-ui/client";

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
  private abortController = new AbortController();

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

  run(input: RunAgentInput) {
    return this.httpStream(this.runUrl, input);
  }

  connect(input: RunAgentInput) {
    return this.httpStream(this.connectUrl, input);
  }

  abortRun(): void {
    const old = this.abortController;
    this.abortController = new AbortController();
    old.abort();
  }

  private requestInit(input: RunAgentInput): RequestInit {
    return {
      method: "POST",
      headers: {
        ...this.headers,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(input),
      signal: this.abortController.signal,
    };
  }

  private httpStream(url: string, input: RunAgentInput) {
    const http$ = runHttpRequest(() => this.fetchImpl(url, this.requestInit(input)));
    return transformHttpEventStream(http$, this.debugLogger);
  }
}
