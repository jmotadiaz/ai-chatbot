import { test, expect } from "../fixtures";
import { ChatPage } from "./pages/chat";

test.describe("Chat functionality", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
  });

  // This test needs a real browser because it verifies the rendered picker and
  // settings popup round trip: the model dropdown opens, "Model settings"
  // shows the selected model's temperature, an edited value survives closing
  // the popup, and switching models replaces it with the new model's declared
  // temperature. The temperature-per-model rule and the request payload are
  // covered socially by tests/unit/chat/model-switch-config.test.tsx; this E2E
  // adds the real picker/settings DOM wiring (labels, dropdown open/close via
  // the backdrop, input value).
  //
  // Re-enabled in ticket 06: the stale FIXME blamed a strict-mode violation
  // from two catalog entries sharing the "MiniMax M3" name. That static
  // catalog is gone; the Mock Model Gateway serves unique capability ids and
  // the picker anchors each option on its id (^<id>\s+I:), so basicChat no
  // longer collides with basicChatAlt (the same selector is exercised by the
  // active seed.spec.ts). Playwright was not run for ticket 06, so the final
  // E2E pass (ticket 16) must confirm this case.
  test("should allow modifying chat settings for different models", async () => {
    await chatPage.header.modelPicker.selectModel("basicChat");
    await expect.soft(chatPage.chat.settingsButton).toBeVisible();

    await chatPage.chat.openSettings();
    await expect
      .soft(chatPage.chat.settings.temperatureInput)
      .toHaveValue("0.6");

    // Modify temperature and verify it persists for this model
    await chatPage.chat.settings.setTemperature(0.5);

    await chatPage.closeDropdown();

    // Switch to a model with a different declared temperature
    await chatPage.header.modelPicker.selectModel("alwaysRefuses");
    await chatPage.chat.openSettings();
    await expect.soft(chatPage.chat.settings.temperatureInput).toHaveValue("1");
  });
});
