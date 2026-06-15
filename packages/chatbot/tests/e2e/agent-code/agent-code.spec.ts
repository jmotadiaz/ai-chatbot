import { test, expect } from "../fixtures";

test.describe("Coding Agent", () => {
  test("user can navigate to a session and send a message", async ({ page }) => {
    await page.goto("/agent/code");
    await expect(page.getByText("Coding Agent")).toBeVisible();

    await page.click("text=ai-chatbot");
    await expect(page.getByText("New session")).toBeVisible();

    await page.click("text=+ New session");
    await page.waitForURL(/\/agent\/code\/ai-chatbot\/.+/, { timeout: 10000 });
    await expect(page.locator("[data-testid='chat-container']")).toBeVisible();

    await page.fill("input[placeholder='Ask the agent...']", "Hello agent");
    await page.click("button:text('Send')");
    await expect(page.getByText("Running...")).toBeVisible();
    await expect(page.getByText("Hello from stub")).toBeVisible();
  });
});
