import { Context7Agent } from "@upstash/context7-tools-ai-sdk";
import { ModelConfiguration } from "@/lib/features/foundation-model/types";

export const createContext7Agent = ({
  modelConfiguration,
}: {
  modelConfiguration: ModelConfiguration;
}) => {
  return new Context7Agent({
    ...modelConfiguration,
  });
};
