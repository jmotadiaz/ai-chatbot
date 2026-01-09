import { Locator, expect } from "@playwright/test";

export class ConfirmModalComponent {
  readonly modal: Locator;
  readonly message: Locator;
  readonly confirmButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Locator) {
    this.modal = page.locator('text=Delete Chat?');
    // Using a more generic selector for the message or we can pass text to verify
    this.message = page.locator('div[role="dialog"] p, div[role="alertdialog"] p');
    // Assuming standard Shadcn Alert Dialog structure
    this.confirmButton = page.getByRole('button', { name: 'Delete', exact: true });
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
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
