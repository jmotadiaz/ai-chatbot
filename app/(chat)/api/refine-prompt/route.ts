import { convertToModelMessages, generateText } from "ai";
import { auth } from "@/auth";
import { languageModelConfigurations } from "@/lib/ai/models/definition";
import {
  chatHistoryPrompt,
  defaultMetaPrompt,
  metaPromptInputFormat,
  metaPromptOutputFormat,
  originalPrompt,
} from "@/lib/ai/prompts";
import { scapeXML } from "@/lib/utils";
import { ChatbotMessage } from "@/lib/ai/types";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const {
    prompt,
    messages,
    metaPrompt = defaultMetaPrompt,
  }: {
    prompt: string;
    messages?: ChatbotMessage[];
    metaPrompt?: string;
  } = await req.json();

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
    ...languageModelConfigurations["GPT OSS"],
    system: metaPrompt + metaPromptInputFormat + metaPromptOutputFormat,
    prompt: initialPrompt + originalPrompt(prompt),
  });

  return Response.json({ text });
}
