import { Context7Agent } from "@upstash/context7-tools-ai-sdk";
import { languageModelConfigurations } from "@/lib/features/foundation-model/config";

export const agent = new Context7Agent({
  ...languageModelConfigurations("GPT OSS"),
});
