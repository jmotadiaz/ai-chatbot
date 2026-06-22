import { test, expect } from "../fixtures";

test.describe("Coding Agent reconnect", () => {
  test("status endpoint returns running: false for a fresh session", async ({ page }) => {
    await page.goto("/agent/code");
    await page.click("text=ai-chatbot");
    await page.click("text=+ New session");
    await page.waitForURL(/\/agent\/code\/ai-chatbot\/.+/, { timeout: 10000 });

    const url = page.url();
    const sessionId = url.split("/").pop() ?? "";

    await expect(page.locator("[data-testid='chat-container']")).toBeVisible();

    const status = await page.request.get(
      `/api/agent/code/sessions/${sessionId}/status`,
    );
    expect(status.ok()).toBeTruthy();
    const body = (await status.json()) as { running: boolean };
    expect(body.running).toBe(false);
  });
});
