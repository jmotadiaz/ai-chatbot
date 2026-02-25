import { Context7Agent } from "@upstash/context7-tools-ai-sdk";
import { ModelConfiguration } from "@/lib/features/foundation-model/types";
import { withMessageProcessing } from "@/lib/features/chat/agents/utils";

export const createContext7Agent = ({
  modelConfiguration,
}: {
  modelConfiguration: ModelConfiguration;
}) => {
  return new Context7Agent({
    ...modelConfiguration,
    prepareStep: withMessageProcessing(modelConfiguration),
  });
};
