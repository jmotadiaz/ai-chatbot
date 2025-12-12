import { convertToModelMessages, generateText } from "ai";
import {
  chatHistoryPrompt,
  defaultMetaPrompt,
  metaPromptInputFormat,
  metaPromptOutputFormat,
  originalPrompt,
} from "./prompts";
import { RefinePromptInput } from "./types";
import { languageModelConfigurations } from "@/lib/features/models/config";
import { scapeXML } from "@/lib/utils";

export async function refinePrompt({
  input,
  messages,
  metaPrompt = defaultMetaPrompt,
}: RefinePromptInput) {
  const chatHistory = convertToModelMessages(messages || []).reduce(
    (acc, message) => {
      const role = message.role === "user" ? "user" : "assistant";
      const content =
        typeof message.content === "string"
          ? message.content.replace(/<[^>]+>/g, "").trim()
          : "";
      return `${acc}
      <${role}>
        ${scapeXML(content)}
      </${role}>
  `;
    },
    ""
  );

  const initialPrompt = chatHistory ? chatHistoryPrompt(chatHistory) : "";

  const { text } = await generateText({
    ...languageModelConfigurations("GPT OSS"),
    system: metaPrompt + metaPromptInputFormat + metaPromptOutputFormat,
    prompt: initialPrompt + originalPrompt(input),
  });

  return text;
}
