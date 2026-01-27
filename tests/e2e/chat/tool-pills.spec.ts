import { test, expect } from "../fixtures";
import { ChatPage } from "./pages/chat";

test.describe("Chat tool pills", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
  });

  test("should hide tool label on mobile and show on desktop", async ({ page }) => {
    // Select a model that supports tools if needed, but the default might work or we can force select one.
    // "Gemini 3 Flash" supports tools as seen in tools.spec.ts
    await chatPage.header.modelPicker.selectModel("Gemini 3 Flash");

    // Enable Web Search tool
    await chatPage.chat.openTools();
    await chatPage.chat.tools.toggleTool("web-search");
    await chatPage.closeDropdown();

    const pill = chatPage.chat.getActiveToolPill("webSearch");
    await expect(pill).toBeVisible();

    const label = pill.locator("span").first();
    const configLabel = "Web Search";

    // Check initial state (Desktop default)
    await expect(label).toHaveText(configLabel);
    await expect(label).toBeVisible();

    // Resize to mobile
    await page.setViewportSize({ width: 375, height: 667 });

    // Label should be hidden
    await expect(label).toBeHidden();

    // Resize back to desktop
    await page.setViewportSize({ width: 1280, height: 720 });

    // Label should be visible
    await expect(label).toBeVisible();
  });
});
