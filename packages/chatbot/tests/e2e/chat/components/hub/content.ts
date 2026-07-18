import { Locator } from "@playwright/test";

export class HubContentComponent {
  readonly container: Locator;
  readonly chatInput: Locator;

  constructor(container: Locator) {
    this.container = container;
    this.chatInput = container.getByTestId("chat-input");
  }

  async sendMessage(message: string) {
    await this.chatInput.fill(message);
    await this.chatInput.press("Enter");
  }
}
