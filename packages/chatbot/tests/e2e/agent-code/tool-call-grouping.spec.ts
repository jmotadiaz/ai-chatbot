import { test, expect } from "../fixtures";

test.describe("Coding Agent — tool call grouping", () => {
  test("renders one group per tool call with a non-empty summary", async ({ page }) => {
    await page.goto("/agent/code");
    await page.click("text=ai-chatbot");
    await page.click("text=+ New session");
    await page.waitForURL(/\/agent\/code\/ai-chatbot\/.+/, { timeout: 10000 });
    await expect(page.locator("[data-testid='chat-container']")).toBeVisible();

    await page.locator("[data-testid='chat-input']").fill("list files and read README");
    await page.locator("button[aria-label='Send message']").click();

    const groups = page.locator("[data-testid='tool-call-group']");
    await expect(groups.first()).toBeVisible({ timeout: 15000 });
    const count = await groups.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Every group has a non-empty summary in its header.
    for (let i = 0; i < count; i++) {
      const text = await groups.nth(i).innerText();
      expect(text.length).toBeGreaterThan(0);
    }
  });
});
