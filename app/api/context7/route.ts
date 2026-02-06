import { createUIMessageStreamResponse, convertToModelMessages  } from "ai";
import { agent } from "@/lib/features/chat/context7-agent";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import type { ChatbotMessage } from "@/lib/features/chat/types";

export const maxDuration = 240;

export const POST = withAuth(async (user, req) => {
  const { messages }: { messages: ChatbotMessage[] } = await req.json();

  const modelMessages = await convertToModelMessages(messages);

  const result = await agent.stream({
    messages: modelMessages,
  });

  return createUIMessageStreamResponse({
    stream: result.toUIMessageStream({
      originalMessages: messages,
      sendReasoning: true,
      sendSources: true,
      messageMetadata: ({ part }) => {
        switch (part.type) {
          case "start":
            return { status: "started" } as const;
          case "text-start":
            return { status: "streaming" } as const;
          case "finish":
            return {
              status: "finished",
            } as const;
          default:
            return undefined;
        }
      },
    }),
  });
});
