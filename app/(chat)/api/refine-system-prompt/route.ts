import { generateText, UIMessage } from "ai";
import { auth } from "@/auth";
import { refinePromptModel } from "@/lib/ai/providers";
import { systemMetaPrompt } from "@/lib/ai/prompts";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const {
    prompt,
  }: {
    prompt: string;
    messages?: UIMessage[];
  } = await req.json();

  const { text } = await generateText({
    model: refinePromptModel,
    system: systemMetaPrompt,
    prompt: "Task, Goal, or Current Prompt:\n" + prompt,
    temperature: 0.2,
  });

  return Response.json({ text });
}
