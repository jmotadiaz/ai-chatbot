import { UIMessage } from "ai";

const SESSION_STORAGE_KEY = "messages";
export function getSessionMessages(): UIMessage[] {
  try {
    return JSON.parse(
      window.sessionStorage.getItem(SESSION_STORAGE_KEY) || "[]"
    ) as UIMessage[];
  } catch {
    return [];
  }
}

export function setMessagesInSession(messages: UIMessage[]) {
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(messages));
}

export function clearSessionMessages() {
  setMessagesInSession([]);
}
