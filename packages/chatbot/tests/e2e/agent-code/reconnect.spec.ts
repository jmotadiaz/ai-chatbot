import { test, expect } from "../fixtures";

test.describe("Coding Agent reconnect", () => {
  // Reloading a session route and issuing a cookie-backed status request
  // require a browser: this keeps the page-lifecycle guarantee that a reload
  // lands on the same session and the authenticated status endpoint still
  // answers for it. A unit test cannot observe a real reload, the Next.js page
  // render or the browser's cookie jar.
  //
  // Limits: the stub always reports running: false, so this does NOT cover
  // mid-run reconnection. That guarantee lives at the route boundary in
  // tests/unit/agent-code/mid-run-reconnect-route.test.ts (status while the run
  // is active, resume after a dropped attachment with no replayed events), and
  // the browser lifecycle triggers (visibilitychange, pagehide/pageshow, freeze,
  // focus, online) are covered by
  // tests/unit/agent-code/use-coding-agent.lifecycle.test.tsx in jsdom.
  // The worker is the in-app stub pinned by config.test.ts, never a real
  // coding-agent process.
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
