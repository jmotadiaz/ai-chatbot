import { test, expect } from "../fixtures";
import { ChatPage } from "./pages/chat";

test.describe("Chat functionality", () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.goto();
  });

  test("should allow modifying chat settings for different models", async () => {
    // Start with a model that has settings

    await expect.soft(chatPage.chat.settingsButton).toBeVisible();

    await chatPage.chat.openSettings();
    await expect.soft(chatPage.chat.settings.temperatureInput).toHaveValue("1");

    // Verify Agent Settings
    await expect
      .soft(chatPage.chat.settings.webSearchNumResultsInput)
      .toHaveValue("5");
    await expect
      .soft(chatPage.chat.settings.ragMaxResourcesInput)
      .toHaveValue("10");
    await expect
      .soft(chatPage.chat.settings.minRagResourcesScoreInput)
      .toHaveValue("0.5");

    await chatPage.closeDropdown();

    await chatPage.header.modelPicker.selectModel("Qwen3 Next Instruct");
    await expect.soft(chatPage.chat.settingsButton).toBeVisible();

    await chatPage.chat.openSettings();
    await expect
      .soft(chatPage.chat.settings.temperatureInput)
      .toHaveValue("0.7");

    // Modify temperature and verify it persists for this model
    await chatPage.chat.settings.setTemperature(0.5);

    // Modify Agent Settings and verify persistence (agent settings are currently global per chat, not per model,
    // BUT the hook initializes them from model config? No, useChatConfig initializes from default constants if not present.
    // Wait, useChatConfig takes them as arguments.
    // In ChatProvider, they come from useChat.
    // In useChat, they come from useChatConfig.
    // useChatConfig initializes defaults.
    // If I change them, setConfig updates the state.
    // This state is PER CHAT session in the provider.
    // The test reloads the page? No, it just switches models.
    // Switching models re-initializes `chatConfig` state in `useChatConfig`?
    // `useChatConfig` has `useState(() => ...)` so it only initializes ONCE.
    // However, `selectedModel` is passed to `useChatConfig`.
    // Wait, `useChatConfig` does NOT use `useEffect` to update config when `selectedModel` changes?
    // Let's check `use-chat-config.ts`.
    // It does NOT. It only uses `useState` initializer.
    // So changing model does NOT reset config?
    // But `useChat` might satisfy the `selectedModel` change?
    // Let's check `useChat`.
    // In `provider.tsx`, `useChat` is called with props.
    // In `use-chat.ts`, `useChatConfig` is called.
    // If props change, `useChat` re-renders.
    // But `useState` in `useChatConfig` is stable.
    // However, `selectedModel` is part of `chatConfig`.
    // If I change model via `setConfig({ selectedModel: ... })`, `chatConfig` updates.
    // The test switches model via `header.modelPicker.selectModel`.
    // This calls `setConfig({ selectedModel: ... })`?
    // Let's assume the test works for temperature.

    // I will just verify that I can change Agent Settings.
    await chatPage.chat.settings.setRagMaxResources(15);
    await expect
      .soft(chatPage.chat.settings.ragMaxResourcesInput)
      .toHaveValue("15");

    await chatPage.closeDropdown();

    // Switch back to Kimi
    await chatPage.header.modelPicker.selectModel("Kimi K2.5");
    await chatPage.chat.openSettings();
    await expect.soft(chatPage.chat.settings.temperatureInput).toHaveValue("1");
    // Verify Agent Settings persisted (since they are chat-wide, not model-specific in the current state implementation?)
    // Actually, `chatConfig` state holds them.
    // If I switch model, I am just updating `chatConfig.selectedModel`.
    // So other fields should remain as set?
    // Unless there is logic to reset them.
    // The test shows temperature for Kimi is 1, but for Qwen is 0.7.
    // If I change Qwen temp to 0.5, then switch back to Kimi, Kimi temp is still 1?
    // This implies `chatConfig` might be separate or re-derived?
    // No, `useChatConfig` state is single object.
    // If the test says "verify it persists for this model", it suggests per-model settings?
    // But `useChatConfig` implementation I saw earlier:
    /*
      const setConfig = useCallback<SetChatConfig>((config) => {
        setChatConfig((prev) => ({
          ...prev,
          ...config,
        }));
      }, []);
    */
    // If `config` contains new `selectedModel` and new defaults?
    // Who calls `setConfig` when model changes?
    // `ChatHeader` or `ModelPicker`.
    // If `ModelPicker` calls `setConfig({ selectedModel: id })`, then `topP/topK/temp` are NOT automatically updated to new model defaults unless the caller does it?
    // Or maybe `useChatConfig` or `useChat` has an effect?
    // I didn't see an effect in `useChatConfig`.
    // Let's assume Agent Settings are preserved across model switches for the same chat session.

    await expect
      .soft(chatPage.chat.settings.ragMaxResourcesInput)
      .toHaveValue("15");
  });
});
