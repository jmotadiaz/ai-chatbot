import { auth } from "@/lib/features/auth/auth-config";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { messagePartsToText } from "@/lib/ai/utils";
import { refinePrompt } from "@/lib/features/meta-prompting/actions";
import { defaultMetaPrompt } from "@/lib/features/meta-prompting/prompts";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const {
    message,
    messages,
    metaPrompt = defaultMetaPrompt,
  }: {
    message: ChatbotMessage;
    messages?: ChatbotMessage[]; // Using generic type from features/chat/types matching route expectation
    metaPrompt?: string;
  } = await req.json();

  const input = messagePartsToText(message);

  const text = await refinePrompt({
    input,
    messages,
    metaPrompt,
  });

  return Response.json({ text });
}
