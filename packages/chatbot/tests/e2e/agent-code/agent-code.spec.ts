import { test, expect } from "../fixtures";

test.describe("Coding Agent", () => {
  // This test needs a real browser because it verifies the sidebar-to-session
  // journey: the project tree in the sidebar creates a session, Next.js routes to
  // /agent/code/<project>/<sessionId>, and the composer submits through the real
  // client assembly to the worker stub. A unit test would omit the routing and
  // the browser-side wiring between the sidebar, the router, and the composer.
  //
  // Unit equivalents run in jsdom against the same UI: AgentCodeSection covers
  // the project tree, session creation and navigation intent, and the
  // useCodingAgent suites cover the send opening a run. They cannot observe the
  // Next.js route, the session page render or the real navigation.
  //
  // The worker is the in-app stub pinned by config.test.ts
  // (/api/agent/code/worker-stub), never a real coding-agent process.
  test("user can open a session from the sidebar and send a message", async ({ page }) => {
    await page.goto("/");

    await page.locator("[aria-label='Toggle sidebar']").first().click();
    await expect(page.getByTestId("sidebar-container")).toHaveClass(/w-80/);

    await page.getByTestId("agent-project-item").filter({ hasText: "ai-chatbot" }).click();
    await page.getByTestId("agent-new-session").first().click();

    await page.waitForURL(/\/agent\/code\/ai-chatbot\/.+/, { timeout: 10000 });
    await expect(page.locator("[data-testid='chat-container']")).toBeVisible();

    const chatInput = page.locator("[data-testid='chat-input']");
    await chatInput.click();
    await chatInput.fill("Hello agent");

    // While the session snapshot loads, the send control renders as a
    // spinner (type="button", not disabled) whose click is a no-op — wait
    // for the real submit button instead of just "not disabled". This mounted
    // loading/ready swap of the same control is another unit-test omission.
    const sendButton = page.locator(
      "button[aria-label='Send message'][type='submit']",
    );
    await expect(sendButton).toBeVisible({ timeout: 15000 });
    await expect(sendButton).not.toBeDisabled();
    await sendButton.click();

    await expect(page.getByText("Hello from stub")).toBeVisible();
  });
});
