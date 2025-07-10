import { generateText, UIMessage } from "ai";
import { auth } from "@/auth";
import { languageModelConfigurations } from "@/lib/ai/models";
import {
  chatHistoryPrompt,
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
    ...languageModelConfigurations["Gemini 2.5 Pro"],
    system: metaPrompt + metaPromptInputFormat + metaPromptOutputFormat,
    prompt: initialPrompt + originalPrompt(prompt),
  });

  return Response.json({ text });
}
