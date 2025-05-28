import { Message } from "ai";

const SESSION_STORAGE_KEY = "messages";
export function getSessionMessages(): Message[] {
  try {
    return JSON.parse(
      window.sessionStorage.getItem(SESSION_STORAGE_KEY) || "[]"
    ) as Message[];
  } catch {
    return [];
  }
}

export function setMessagesInSession(messages: Message[]) {
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(messages));
}

export function clearSessionMessages() {
  setMessagesInSession([]);
}
