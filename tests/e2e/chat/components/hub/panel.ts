import { Locator } from "@playwright/test";

export class HubPanelComponent {
  readonly container: Locator;
  readonly messages: Locator;
  readonly removeButton: Locator;
  readonly selectButton: Locator;
  readonly deleteButton: Locator;

  constructor(container: Locator) {
    this.container = container;
    this.messages = container.getByRole("paragraph");
    this.removeButton = container.getByRole("button", {
      name: "Remove instance",
    });
    this.selectButton = container.getByRole("button", {
      name: "Select this chat",
    });
    this.deleteButton = container.getByRole("button", {
      name: "Delete chat",
    });
  }

  async getLastAssistantMessage(): Promise<string | null> {
    // Wait for the message to be visible and have content (not loading)
    // The hub renders the assistant reply as a <p> (role=paragraph). Using role-based selectors
    // is more resilient than relying on custom attributes.
    const lastParagraph = this.messages.last();
    await lastParagraph.waitFor({ state: "visible" });
    return lastParagraph.textContent();
  }
}
