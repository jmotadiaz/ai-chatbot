import fs from "node:fs/promises";
import path from "node:path";
import { config } from "config";
import { test, expect } from "../fixtures";

const ARTIFACT_NAME = "e2e-artifact";
const PROJECT = "ai-chatbot";
const ARTIFACT_DIR = path.join(config.codingAgentArtifactsDir(), PROJECT, ARTIFACT_NAME);
const ARTIFACT_FILE = path.join(ARTIFACT_DIR, "index.html");
const SEEDED_TEXT = "E2E artifact content";

test.describe("Coding Agent artifacts", () => {
  // This test needs a real browser because it verifies the end-to-end artifact
  // journey: a session is created through the sidebar, the worker stub streams a
  // Markdown link, CodingAgentMarkdownAnchor intercepts it as a Next <Link>, the
  // artifact route renders the seeded index.html inside a sandboxed iframe, and
  // "Back to chat" returns to the session. Unit tests cover the anchor and the
  // page in isolation but cannot observe routing, iframe loading or auth cookies.
  //
  // The worker is the in-app stub pinned by config.test.ts
  // (/api/agent/code/worker-stub), never a real coding-agent process.

  test.beforeEach(async () => {
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
    await fs.writeFile(ARTIFACT_FILE, `<!DOCTYPE html><html><body><p>${SEEDED_TEXT}</p></body></html>`);
  });

  test.afterEach(async () => {
    await fs.rm(ARTIFACT_DIR, { recursive: true, force: true });
  });

  test("artifact link opens the sandboxed iframe view and Back to chat returns", async ({ page }) => {
    await page.goto("/");

    await page.locator("[aria-label='Toggle sidebar']").first().click();
    await expect(page.getByTestId("sidebar-container")).toHaveClass(/w-80/);

    await page.getByTestId("agent-project-item").filter({ hasText: PROJECT }).click();
    await page.getByTestId("agent-new-session").first().click();

    await page.waitForURL(/\/agent\/code\/ai-chatbot\/.+/, { timeout: 10000 });
    const sessionUrl = page.url();
    const sessionId = sessionUrl.match(/\/agent\/code\/ai-chatbot\/([^/]+)/)?.[1];
    expect(sessionId).toBeTruthy();

    const chatInput = page.locator("[data-testid='chat-input']");
    await chatInput.click();
    await chatInput.fill("show me an artifact");

    const sendButton = page.locator("button[aria-label='Send message'][type='submit']");
    await expect(sendButton).toBeVisible({ timeout: 15000 });
    await expect(sendButton).not.toBeDisabled();
    await sendButton.click();

    const link = page.getByTestId("agent-artifact-link").first();
    await expect(link).toBeVisible({ timeout: 15000 });
    await link.click();

    await page.waitForURL(new RegExp(`/agent/code/ai-chatbot/${sessionId}/artifacts/${ARTIFACT_NAME}`), { timeout: 10000 });

    await page.locator("[aria-label='Toggle sidebar']").first().click();
    await expect(page.getByTestId("sidebar-container")).toHaveClass(/w-80/);
    await expect(page.locator('[aria-label="Back to chat"]')).toBeVisible();

    // active sidebar row still points at this session
    await expect(page.locator(`[data-testid="agent-session-link"][href*="${sessionId}"]`)).toBeVisible();

    const iframe = page.locator("iframe");
    await expect(iframe).toBeVisible();
    await expect(iframe).toHaveAttribute("sandbox", "allow-scripts allow-downloads allow-popups");
    await expect(iframe).not.toHaveAttribute("sandbox", /allow-same-origin/);

    const frame = page.frameLocator("iframe");
    await expect(frame.getByText(SEEDED_TEXT)).toBeVisible({ timeout: 15000 });

    await page.locator('[aria-label="Back to chat"]').click();
    await page.waitForURL(new RegExp(`/agent/code/ai-chatbot/${sessionId}$`), { timeout: 10000 });
    await expect(page.locator("[data-testid='chat-container']")).toBeVisible();
  });
});
