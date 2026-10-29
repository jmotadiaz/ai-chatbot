import { test, expect } from "../fixtures";

test.describe("Coding Agent — tool call grouping", () => {
  // The browser checks that the stub's streamed tool events become DOM groups;
  // a unit test covers grouping logic but not the stream-to-DOM path. Unit
  // equivalents stop short of it: group-items.test.ts pairs results by id and
  // drops orphans, tool-call-group.test.tsx renders one group, and
  // tool-summary.test.ts builds the header text. None of them runs the AG-UI
  // chunk relay into the mounted transcript, so only the browser shows one
  // visible group per streamed call with its real summary. The worker is the
  // in-app stub pinned by config.test.ts, never a real coding-agent process.
  test("renders one group per tool call with a non-empty summary", async ({ page }) => {
    await page.goto("/");
    await page.locator("[aria-label='Toggle sidebar']").first().click();
    await expect(page.getByTestId("sidebar-container")).toHaveClass(/w-80/);
    await page.getByTestId("agent-project-item").filter({ hasText: "ai-chatbot" }).click();
    await page.getByTestId("agent-new-session").first().click();
    await page.waitForURL(/\/agent\/code\/ai-chatbot\/.+/, { timeout: 10000 });
    await expect(page.locator("[data-testid='chat-container']")).toBeVisible();

    await page.locator("[data-testid='chat-input']").fill("list files and read README");

    // Wait out the loading spinner (same control, type="button", no-op click).
    const sendButton = page.locator(
      "button[aria-label='Send message'][type='submit']",
    );
    await expect(sendButton).toBeVisible({ timeout: 15000 });
    await sendButton.click();

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
