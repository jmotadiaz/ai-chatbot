import { Locator } from "@playwright/test";

export class HubPanelComponent {
  readonly container: Locator;
  readonly messages: Locator;

  constructor(container: Locator) {
    this.container = container;
    this.messages = container.getByRole("paragraph");
  }

  async getLastAssistantMessage(): Promise<string | null> {
    // Wait for the message to be visible and have content (not loading)
    const lastMessage = this.container.locator('[data-role="assistant"]').last();
    await lastMessage.waitFor({ state: "visible" });
    return lastMessage.textContent();
  }
}
