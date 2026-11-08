"use client";

import * as React from "react";
import { memo, useMemo, useState } from "react";
import { ChevronDownIcon, Layers, Sparkles, TriangleAlert } from "lucide-react";
import { ToolCallGroup } from "./tool-call-group";
import { toolIcon } from "./tool-icon";
import { ReasoningBlock } from "@/components/chat/reasoning";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Shimmer } from "@/components/ui/shimmer";
import {
  describeReActCycle,
  type ReActCycle,
  type ReActCycleStep,
} from "@/lib/features/code/react-cycles";

export interface ReActCycleViewProps {
  cycle: ReActCycle;
  /** The cycle is the tail of a Turn that is still running. */
  active: boolean;
  /** The cycle's tail reasoning Step is still receiving chunks. */
  streamingReasoning?: boolean;
}

function stepEqual(previous: ReActCycleStep, next: ReActCycleStep): boolean {
  if (previous.kind !== next.kind || previous.id !== next.id) return false;
  if (previous.kind === "reasoning" && next.kind === "reasoning") {
    return previous.message.content === next.message.content;
  }
  if (previous.kind === "tool" && next.kind === "tool") {
    const p = previous.group;
    const n = next.group;
    return (
      p.name === n.name &&
      p.status === n.status &&
      p.result === n.result &&
      p.summary === n.summary &&
      p.summaryTitle === n.summaryTitle &&
      p.finishedAt === n.finishedAt &&
      p.args === n.args
    );
  }
  return true;
}

function cycleEqual(previous: ReActCycle, next: ReActCycle): boolean {
  if (
    previous.id !== next.id ||
    previous.originMessageId !== next.originMessageId ||
    previous.steps.length !== next.steps.length
  ) {
    return false;
  }
  return previous.steps.every((step, index) =>
    stepEqual(step, next.steps[index]),
  );
}

/**
 * One ReAct Cycle: the reasoning and tool calls that ran before the assistant
 * addressed the user. Collapsed by default, its trigger names the work in
 * flight and opening it shows the unchanged reasoning and tool rows. It never
 * closes itself when the cycle ends: the open state belongs to the user.
 */
export const ReActCycleView = memo<ReActCycleViewProps>(
  ({ cycle, active, streamingReasoning = false }) => {
    const [open, setOpen] = useState(false);
    const header = useMemo(
      () => describeReActCycle(cycle, active),
      [cycle, active],
    );

    const Icon = header.hasError
      ? TriangleAlert
      : header.singleRunningTool
        ? toolIcon(header.singleRunningTool.name)
        : header.runningTools.length > 1
          ? Layers
          : Sparkles;
    const tone = header.hasError
      ? "text-red-600 dark:text-red-400"
      : "text-zinc-500 dark:text-zinc-400";
    const lastStep = cycle.steps[cycle.steps.length - 1];

    return (
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="mb-3"
        data-testid="react-cycle"
        data-active={active ? "true" : "false"}
        data-status={header.hasError ? "error" : active ? "running" : "ok"}
      >
        <CollapsibleTrigger className="flex min-h-9 w-full min-w-0 items-center gap-2 py-1.5 text-left text-base transition-colors hover:text-foreground cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <Icon className={`size-4 shrink-0 ${tone}`} />
          {header.shimmer ? (
            // No colour utility here: the sweep only shows through the
            // `text-transparent` / `bg-clip-text` that Shimmer sets itself, and
            // a `text-*` class on the same element would paint over it.
            <Shimmer
              as="span"
              className="min-w-0 truncate text-left font-semibold"
              textLength={header.label.length}
            >
              {header.label}
            </Shimmer>
          ) : (
            <span
              className={`min-w-0 truncate font-semibold ${tone}`}
              title={header.label}
            >
              {header.label}
            </span>
          )}
          <ChevronDownIcon
            className={`size-4 shrink-0 transition-transform ${tone} ${
              open ? "rotate-180" : "rotate-0"
            }`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="outline-none data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=open]:animate-in">
          <div className="mt-1 ml-2 pl-3 sm:pl-4 border-l-2 border-zinc-200 dark:border-zinc-800 flex flex-col gap-1">
            {cycle.steps.map((step) => {
              if (step.kind === "reasoning") {
                const text =
                  typeof step.message.content === "string"
                    ? step.message.content
                    : "";
                return (
                  <ReasoningBlock
                    key={step.id}
                    text={text}
                    // Inside the rail every Thinking gets the same breathing
                    // room above and below, so it reads as the header of the
                    // calls that follow it instead of hugging the row above.
                    className="mt-2 mb-2"
                    isStreaming={
                      streamingReasoning && active && lastStep?.id === step.id
                    }
                  />
                );
              }
              return <ToolCallGroup key={step.id} group={step.group} />;
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  },
  (previous, next) =>
    previous.active === next.active &&
    previous.streamingReasoning === next.streamingReasoning &&
    cycleEqual(previous.cycle, next.cycle),
);

ReActCycleView.displayName = "ReActCycleView";
