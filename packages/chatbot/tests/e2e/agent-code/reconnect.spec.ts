import { test, expect } from "../fixtures";

test.describe("Coding Agent reconnect", () => {
  test("page loads and status endpoint returns running: false", async ({ page }) => {
    await page.goto("/agent/code");
    await page.click("text=ai-chatbot");
    await page.click("text=+ New session");
    await page.waitForURL(/\/agent\/code\/ai-chatbot\/.+/, { timeout: 10000 });
    await page.waitForTimeout(1500);

    await expect(page.locator("[data-testid='chat-container']")).toBeVisible();

    const status = await page.request.get(
      "/api/agent/code/sessions/test-session/status",
    );
    expect(status.ok()).toBeTruthy();
    const body = (await status.json()) as { running: boolean };
    expect(body.running).toBe(false);
  });
});
