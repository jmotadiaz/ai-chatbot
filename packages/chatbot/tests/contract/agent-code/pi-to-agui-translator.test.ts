import { describe, expect, it } from "vitest";
import { PiToAguiTranslator as WorkerTranslator } from "coding-agent/pi-to-agui-translator";
import { PiToAguiTranslator as ChatbotTranslator } from "@/lib/features/code/pi-to-agui-translator";

describe("coding-agent public boundary", () => {
  it("keeps the chatbot adapter wired to the worker's public translator export", () => {
    expect(ChatbotTranslator).toBe(WorkerTranslator);
  });
});
