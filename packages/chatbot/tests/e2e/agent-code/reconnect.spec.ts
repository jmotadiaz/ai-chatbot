import { test, expect } from "../fixtures";

test.describe("Coding Agent reconnect", () => {
  // Reload and cookie-backed status requests require a browser. The worker
  // stub reports running: false, so this does not cover mid-run reconnection.
  test("status endpoint returns running: false for a fresh session after a reload", async ({ page }) => {
    await page.goto("/");
    await page.locator("[aria-label='Toggle sidebar']").first().click();
    await expect(page.getByTestId("sidebar-container")).toHaveClass(/w-80/);
    await page.getByTestId("agent-project-item").filter({ hasText: "ai-chatbot" }).click();
    await page.getByTestId("agent-new-session").first().click();
    await page.waitForURL(/\/agent\/code\/ai-chatbot\/.+/, { timeout: 10000 });
    await expect(page.locator("[data-testid='chat-container']")).toBeVisible();

    await page.reload();
    await expect(page.locator("[data-testid='chat-container']")).toBeVisible();

    const sessionId = new URL(page.url()).pathname.split("/").pop() ?? "";
    const status = await page.request.get(
      `/api/agent/code/sessions/${sessionId}/status`,
    );
    expect(status.ok()).toBeTruthy();
    const body = (await status.json()) as { running: boolean };
    expect(body.running).toBe(false);
  });
});
