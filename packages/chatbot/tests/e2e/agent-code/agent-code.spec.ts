import { test, expect } from "../fixtures";

test.describe("Coding Agent", () => {
  test("user can navigate to a session and send a message", async ({ page }) => {
    await page.goto("/agent/code");
    await expect(page.getByRole("heading", { name: "Coding Agent" })).toBeVisible();

    await page.click("text=ai-chatbot");
    await expect(page.getByText("New session")).toBeVisible();

    await page.click("text=+ New session");
    await page.waitForURL(/\/agent\/code\/ai-chatbot\/.+/, { timeout: 10000 });
    await expect(page.locator("[data-testid='chat-container']")).toBeVisible();

    const chatInput = page.locator("[data-testid='chat-input']");
    await chatInput.click();
    await chatInput.fill("Hello agent");

    // While the session snapshot loads, the send control renders as a
    // spinner (type="button", not disabled) whose click is a no-op — wait
    // for the real submit button instead of just "not disabled".
    const sendButton = page.locator(
      "button[aria-label='Send message'][type='submit']",
    );
    await expect(sendButton).toBeVisible({ timeout: 15000 });
    await expect(sendButton).not.toBeDisabled();
    await sendButton.click();

    await expect(page.getByText("Hello from stub")).toBeVisible();
  });
});
