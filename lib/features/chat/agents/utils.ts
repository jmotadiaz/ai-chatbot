import {
  StepResult,
  ToolSet,
  pruneMessages,
  type PrepareStepFunction,
} from "ai";
import { Tool } from "@/lib/features/chat/types";
import { ModelConfiguration } from "@/lib/features/foundation-model/types";

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

export const IS_TEST_ENV = !!(process.env.NEXT_PUBLIC_ENV === "test");

/**
 * Wraps a prepareStep function to:
 * 1. Short-circuit with `{ activeTools: [] }` in test environments
 * 2. Prune reasoning from messages when the model doesn't support it
 *
 * The inner prepareStep's result always takes priority via spread order.
 */
export const withMessageProcessing = <T extends ToolSet>(
  modelConfiguration: ModelConfiguration,
  innerPrepareStep?: PrepareStepFunction<T>,
): PrepareStepFunction<T> => {
  return async (context) => {
    if (IS_TEST_ENV) {
      return { activeTools: [] };
    }

    const innerResult = await innerPrepareStep?.(context);

    const processedMessages = modelConfiguration.reasoning
      ? context.messages
      : pruneMessages({ messages: context.messages, reasoning: "all" });

    return {
      messages: processedMessages,
      ...innerResult,
    };
  };
};
