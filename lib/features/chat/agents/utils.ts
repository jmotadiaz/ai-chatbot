import { StepResult, ToolSet } from "ai";
import { Tool } from "@/lib/features/chat/types";

export const hasToolCallSteps = <T extends ToolSet>({
  steps,
  toolName,
}: {
  steps: StepResult<T>[];
  toolName: Tool;
}) => {
  return steps.some((step) =>
    step.toolCalls.some((toolCall) => toolCall.toolName === toolName),
  );
};
