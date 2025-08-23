import { ChatConfig } from "@/app/providers";
import { Tools } from "@/lib/ai/tools/types";
import { ChatbotMessage } from "@/lib/ai/types";

const SESSION_STORAGE_KEY = "chat_data";

interface ChatDataInSession {
  messages?: ChatbotMessage[];
  chatConfig?: Partial<ChatConfig>;
  tools?: Tools;
}

export function getSessionChatData(): ChatDataInSession {
  try {
    return JSON.parse(
      window.sessionStorage.getItem(SESSION_STORAGE_KEY) || "{}"
    ) as ChatDataInSession;
  } catch {
    return {};
  }
}

export function setChatDataInSession({
  messages,
  chatConfig,
  tools,
}: ChatDataInSession) {
  window.sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      messages: messages?.map((message) => ({
        ...message,
        parts: message.parts.filter((part) => part.type !== "file"),
      })),
      chatConfig,
      tools,
    })
  );
}

export function clearChatDataInSession() {
  setChatDataInSession({});
}
