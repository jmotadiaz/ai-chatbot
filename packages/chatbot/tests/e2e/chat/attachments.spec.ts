import { test, expect } from "../fixtures";
import { ChatPage } from "./pages/chat";

// This test needs a real browser because it verifies the rendered composer
// reacts to the picker: after selecting an image-capable catalog id, opening
// the attachment menu exposes the image file input. The menu rules are covered
// socially by tests/unit/attachment/attachments-control; a unit test would omit
// the picker -> header -> composer wiring and the installed browser file input.
test.describe("Chat attachments", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
  });

  test("should show correct attachment options for image-only models", async () => {
    await chatPage.header.modelPicker.selectModel("canSeeImages");

    await chatPage.chat.openAttachmentMenu();
    // Wait for menu content to be visible
    await expect(chatPage.chat.imageInputLabel).toBeVisible();
  });
});
