import { ChatbotMessage } from "@/lib/ai/types";

const SESSION_STORAGE_KEY = "messages";
export function getSessionMessages(): ChatbotMessage[] {
  try {
    return JSON.parse(
      window.sessionStorage.getItem(SESSION_STORAGE_KEY) || "[]"
    ) as ChatbotMessage[];
  } catch {
    return [];
  }
}

export function setMessagesInSession(messages: ChatbotMessage[]) {
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(messages));
}

export function clearSessionMessages() {
  setMessagesInSession([]);
}
