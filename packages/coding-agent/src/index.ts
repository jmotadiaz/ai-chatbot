import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

export type { AgentSessionEvent };

export interface RelaxedTextContent {
  type?: string;
  text?: string;
}

export interface RelaxedThinkingContent {
  type?: string;
  thinking?: string;
  redacted?: boolean;
}

export interface RelaxedToolCall {
  type?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
}

export interface RelaxedImageContent {
  type?: string;
  data?: string;
  mimeType?: string;
}

export type ContentBlock = RelaxedTextContent | RelaxedThinkingContent | RelaxedToolCall | RelaxedImageContent;

export interface CodingAgentMessage {
  id?: string;
  role?: string;
  toolCallId?: string;
  content?: string | ContentBlock[];
  /**
   * Set once when the Pi message is created and never rewritten afterward —
   * stable across `message_start`/`message_update`/`message_end` for the
   * same message. Used to derive deterministic AG-UI message ids.
   */
  timestamp?: number;
}

type RelaxedDeep<T> = T extends Array<infer U>
  ? Array<RelaxedDeep<U>>
  : T extends object
    ? T extends { type: infer Type }
      ? { type?: Type } & { [K in Exclude<keyof T, "type">]?: RelaxedProperty<K, T[K]> } & { [key: string]: unknown }
      : { [K in keyof T]?: RelaxedProperty<K, T[K]> } & { [key: string]: unknown }
    : T;

type RelaxedProperty<K, V> = K extends "content"
  ? string | ContentBlock[]
  : K extends "toolCall"
    ? RelaxedToolCall
    : K extends "message"
      ? CodingAgentMessage
      : K extends "result"
        ? unknown
        : RelaxedDeep<V>;

type RelaxedAssistantMessageEvent<T> = T extends unknown
  ? { type: T extends { type: infer Type } ? Type : never } & {
      [K in Exclude<keyof T, "type">]?: RelaxedProperty<K, T[K]>;
    } & {
      toolCall?: RelaxedToolCall;
    } & { [key: string]: unknown }
  : never;

export type CodingAgentEvent = {
  [T in AgentSessionEvent as T["type"]]: { type: T["type"] } & {
    [K in Exclude<keyof T, "type">]?: K extends "assistantMessageEvent"
      ? RelaxedAssistantMessageEvent<T[K]>
      : RelaxedProperty<K, T[K]>
  } & { [key: string]: unknown }
}[AgentSessionEvent["type"]] | { type: "error"; message: string };

export type CodingAgentAssistantEvent = Extract<
  CodingAgentEvent,
  { type: "message_update" }
>["assistantMessageEvent"];
