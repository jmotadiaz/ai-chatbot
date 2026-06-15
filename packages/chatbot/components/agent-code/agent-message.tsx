"use client";

import * as React from "react";
import { memo } from "react";
import { Streamdown } from "streamdown";
import { ChevronDownIcon } from "lucide-react";
import type { Message, ToolCall } from "@ag-ui/client";
import { Response } from "@/components/chat/response";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export interface AgentMessageProps {
  message: Message;
}

function toolCallLabel(tc: ToolCall): string {
  const name = tc.function?.name ?? tc.type ?? "tool";
  return name;
}

const ToolCallBadge: React.FC<{ tc: ToolCall }> = ({ tc }) => (
  <div className="my-2 text-sm text-muted-foreground">
    <span className="font-mono bg-secondary px-2 py-1 rounded">
      {toolCallLabel(tc)}
    </span>
  </div>
);

const ToolResultBlock: React.FC<{ content: string }> = ({ content }) => (
  <details className="my-2 text-xs">
    <summary className="cursor-pointer text-muted-foreground select-none">
      Tool result
    </summary>
    <pre className="mt-2 p-2 bg-secondary rounded overflow-x-auto whitespace-pre-wrap">
      {content}
    </pre>
  </details>
);

const ReasoningBlock: React.FC<{ content: string }> = ({ content }) => (
  <Collapsible className="mb-4 not-prose" defaultOpen={false}>
    <CollapsibleTrigger className="flex w-full items-center space-x-2 text-muted-foreground text-sm cursor-pointer user-select-none">
      <span className="font-semibold">Reasoning</span>
      <ChevronDownIcon className="size-4 transition-transform [[data-state=open]_&]:rotate-180" />
    </CollapsibleTrigger>
    <CollapsibleContent className="mt-2 text-sm text-muted-foreground">
      <Streamdown>{content}</Streamdown>
    </CollapsibleContent>
  </Collapsible>
);

export const AgentMessage: React.FC<AgentMessageProps> = memo(({ message }) => {
  if (message.role === "user") {
    const text = typeof message.content === "string" ? message.content : "";
    return (
      <div className="mb-8 pt-4">
        <div className="flex gap-4 w-full ml-auto max-w-full w-fit">
          <div className="flex flex-col w-full space-y-2">
            <div className="flex flex-col max-w-full bg-secondary py-4 pl-4 pr-8 rounded-tl-3xl rounded-br-3xl rounded-bl-3xl">
              {text}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (message.role === "reasoning") {
    const text = typeof message.content === "string" ? message.content : "";
    if (!text) return null;
    return (
      <div className="mb-4 pt-2">
        <ReasoningBlock content={text} />
      </div>
    );
  }

  if (message.role === "tool") {
    const text = typeof message.content === "string" ? message.content : "";
    return (
      <div className="mb-2 pl-4 max-w-full">
        <ToolResultBlock content={text} />
      </div>
    );
  }

  if (message.role === "assistant") {
    const text = typeof message.content === "string" ? message.content : "";
    return (
      <div className="mb-8 pt-4">
        <div className="flex flex-col w-full space-y-2">
          {message.toolCalls?.map((tc) => (
            <ToolCallBadge key={tc.id} tc={tc} />
          ))}
          {text && (
            <div className="max-w-full">
              <Response>{text}</Response>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
});

AgentMessage.displayName = "AgentMessage";
