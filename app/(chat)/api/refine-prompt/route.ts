import { generateText, UIMessage } from "ai";
import { auth } from "@/auth";
import { languageModelConfigurations } from "@/lib/ai/models";
import {
  chatHistoryPrompt,
  concatenatePrompts,
  defaultMetaPrompt,
  metaPromptInputFormat,
  metaPromptOutputFormat,
  originalPrompt,
} from "@/lib/ai/prompts";
import { scapeXML } from "@/lib/utils";

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
    messages?: UIMessage[];
    metaPrompt?: string;
  } = await req.json();

  const chatHistory = (messages || []).reduce((acc, message) => {
    const role = message.role === "user" ? "user" : "assistant";
    const content = message.content.replace(/<[^>]+>/g, "").trim();
    return `${acc}
      <${role}>
        ${scapeXML(content)}
      </${role}>
  `;
  }, "");

  const initialPrompt = chatHistory ? chatHistoryPrompt(chatHistory) : "";

  const { text } = await generateText({
    ...languageModelConfigurations["o4 Mini"],
    system:
      metaPrompt +
      concatenatePrompts +
      metaPromptInputFormat +
      concatenatePrompts +
      metaPromptOutputFormat,
    prompt: initialPrompt + concatenatePrompts + originalPrompt(prompt),
    temperature: 0.2,
  });

  return Response.json({ text });
}
