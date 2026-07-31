import { test, expect } from "../fixtures";
import { ChatHubPage } from "./pages/hub";
import { CAPABILITY_ALIASES } from "@/tests/mocks/ai/capabilities";

const TOOLS_MODEL = CAPABILITY_ALIASES.canExecuteTools;

test.describe("Chat Hub - Sidebar Integration", () => {
  let hubPage: ChatHubPage;

  test.beforeEach(async ({ page }) => {
    hubPage = new ChatHubPage(page);
    await page.setViewportSize({ width: 1600, height: 1200 });
    await hubPage.goto();
    await expect(page).toHaveURL(/\/chat\/hub/);
  });

  test("should update sidebar when saving a chat", async ({ page }) => {
    // Add a model
    await hubPage.header.addModel("canExecuteTools");

    // Send a message
    const uniqueMessage = `Hub Sidebar Test ${Date.now()}`;
    await hubPage.hubContent.sendMessage(uniqueMessage);

    // Wait for response and panel
    const panel = hubPage.getPanel(TOOLS_MODEL);
    // Ensure tab is active
    await hubPage.header.selectTab(TOOLS_MODEL);
    await expect(panel.container).toBeVisible();

    // Click "Select this chat"
    await expect(panel.selectButton).toBeVisible();
    await panel.selectButton.click();

    // Wait for button to change to "Delete chat" (indicates save complete)
    await expect(panel.deleteButton).toBeVisible();

    // Toggle sidebar to verify chat is present
    await page.getByLabel("Toggle sidebar").click();
    await expect(hubPage.sidebar.container).toBeVisible();

    // Check if the chat appears in the list
    // Since we start with a fresh user, there should be exactly 1 chat
    await expect(hubPage.sidebar.chatList.getByRole("listitem")).toHaveCount(1);
  });
});
