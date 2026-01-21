import { Locator, expect } from "@playwright/test";

export class ConfirmModalComponent {
  readonly modal: Locator;
  readonly message: Locator;
  readonly confirmButton: Locator;
  readonly cancelButton: Locator;

  constructor(root: Locator) {
    // Find a div that contains the "Delete Chat?" title, scoped to the container (sidebar or history)
    // This avoids using data-testid on the modal itself while maintaining unique scoping.
    this.modal = root
      .locator("div")
      .filter({
        has: root
          .page()
          .locator("h3")
          .filter({ hasText: /Delete (Chat|Project)/ }),
      })
      .last();
    this.message = this.modal.locator("p");
    this.confirmButton = this.modal.getByRole("button", {
      name: "Delete",
      exact: true,
    });
    this.cancelButton = this.modal.getByRole("button", { name: "Cancel" });
  }

  async isVisible() {
    await expect(this.modal).toBeVisible();
  }

  async isHidden() {
    await expect(this.modal).not.toBeVisible();
  }

  async hasMessage(text: string) {
    await expect(this.message).toContainText(text);
  }

  async confirm() {
    await this.confirmButton.click();
  }

  async cancel() {
    await this.cancelButton.click();
  }
}
