// spec: specs/chat-hub.md
// seed: tests/e2e/chat/conversation.spec.ts

import { test, expect } from "../fixtures";
import { ChatHubPage } from "./pages/hub";

test.describe("Chat Hub", () => {
  let hubPage: ChatHubPage;

  test.beforeEach(async ({ page, authenticatedUser }) => {
    hubPage = new ChatHubPage(page);
    await hubPage.goto();
    expect(authenticatedUser.email).toBeDefined();
  });

  test("Model Comparison (Happy Path)", async () => {
    // 1. Navigate to /chat/hub (handled in beforeEach)

    // 2. Add 'GPT OSS' model
    await hubPage.header.addModel("OpenAI GPT OSS I: | O: | | |");

    // 3. Add 'Llama 4 Scout' model
    await hubPage.header.addModel("Meta Llama 4 Scout I: | O: | |");

    // 4. Send "Hello models!" in the central input
    await hubPage.hubContent.sendMessage("Hello models!");

    // 5. Verify both models respond correctly
    // Verify GPT OSS response
    await hubPage.header.selectTab("GPT OSS");
    const gptPanel = hubPage.getPanel("GPT OSS");
    const gptResponse = await gptPanel.getLastAssistantMessage();
    expect.soft(gptResponse).toContain("gpt-oss");

    // Verify Llama 4 Scout response
    await hubPage.header.selectTab("Llama 4 Scout");
    const llamaPanel = hubPage.getPanel("Llama 4 Scout");
    const llamaResponse = await llamaPanel.getLastAssistantMessage();
    expect.soft(llamaResponse).toContain("llama-4-scout");
  });
});
