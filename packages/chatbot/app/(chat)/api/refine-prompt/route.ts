import { auth } from "@/lib/features/auth/auth-config";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { messagePartsToText } from "@/lib/features/chat/utils";
import { refinePrompt } from "@/lib/features/meta-prompt/actions";
import type { RefinePromptMode } from "@/lib/features/meta-prompt/types";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const {
    message,
    messages,
    mode,
    projectId,
  }: {
    message: ChatbotMessage;
    messages?: ChatbotMessage[];
    mode?: RefinePromptMode;
    projectId?: string;
  } = await req.json();

  const input = messagePartsToText(message);

  const text = await refinePrompt({
    input,
    messages,
    mode,
    projectId,
    userId: session.user.id,
  });

  return Response.json({ text });
}
