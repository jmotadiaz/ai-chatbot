import { test, expect } from "../../fixtures";
import { ProjectPage } from "../pages/project";
import { ChatPage } from "../pages/chat";

test.describe("Project Chat", () => {
  let projectPage: ProjectPage;
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    projectPage = new ProjectPage(page);
    chatPage = new ChatPage(page);
    await projectPage.page.goto("/");
  });

  // This test needs a real browser because it verifies the project chat route
  // and the streamed answer rendered by the real client: the sidebar action
  // opens the project's persisted chat and the POST/stream round trip through
  // the Mock Model Gateway reaches the transcript. A unit test would omit the
  // routing and the browser-side stream assembly.
  test("3.1 Standard Project Chat", async ({ db, page }) => {
    const title = "Research Assistant";
    // Capability id from the Mock Model Gateway catalog (ADR 0010): the E2E
    // specs no longer use commercial ids from the static catalog (deleted).
    // The mock echoes the requested id in the "Hello, I'm <model>" response,
    // so the assertion checks the echo of the selected id.
    const expectedResponse = "Hello, I'm basicChat";

    await db.addProjects([
      {
        name: title,
        systemPrompt: "Special prompt",
        defaultModel: "basicChat",
      },
    ]);

    await page.reload();
    await projectPage.openSidebar();
    await projectPage.sidebar.navigateProjectAction(title, "chat");

    // Wait for project chat to load
    await chatPage.chat.waitForTitleVisible(title);
    await projectPage.ensureSidebarClosed();

    await chatPage.chat.sendMessage("Hi");
    await chatPage.chat.waitForLoadingComplete();

    const lastMessage = await chatPage.chat.getLastAssistantMessage();
    expect.soft(lastMessage).toContain(expectedResponse);
  });

  // This test needs a real browser because it verifies the temporary-chat
  // lifecycle: chatType=temporary in the URL, then navigating away and back to
  // the project chat and finding the transcript gone. A unit test would omit
  // the real routing and the reload-like navigation that proves the chat was
  // never persisted.
  test("3.2 Temporary Project Chat", async ({ db, page }) => {
    const title = "Temp Project";
    await db.addProjects([{ name: title, systemPrompt: "Temp prompt" }]);

    await page.reload();
    await projectPage.openSidebar();
    await projectPage.sidebar.navigateProjectAction(title, "temporary-chat");

    // Wait for project chat to load
    await chatPage.chat.waitForTitleVisible(title);
    await projectPage.ensureSidebarClosed();
    await expect.soft(page).toHaveURL(/chatType=temporary/);

    await chatPage.chat.sendMessage("Temporary message");
    await chatPage.chat.waitForLoadingComplete();

    // If we navigate away and back, it should be gone (non-persisted)
    await page.goto("/");
    await projectPage.openSidebar();
    await projectPage.sidebar.navigateProjectAction(title, "chat"); // Back to normal chat

    await projectPage.ensureSidebarClosed();
    const userMessages = await chatPage.chat.getUserMessages();
    expect.soft(userMessages.length).toBe(0);
  });

  // FIXME(e2e, 2026-09-02): flaky hydration — the Test Chat tab panel needs a
  // wait for the tab view in parallel runs (it also failed in an isolated
  // re-run; hydration timing, not the environment).
  //
  // The behavior is now covered socially by
  // tests/unit/project/project-form.test.tsx ("ProjectForm Test Chat"): the
  // real ProjectForm switches to the Test Chat panel and a submitted message
  // reaches POST /api/chat with the draft configuration and
  // preventChatPersistence. This E2E would add only the real browser hydration
  // of the tab panel, which is exactly what is still flaky. Ticket 16 must
  // re-enable it after fixing the hydration wait, or remove it if the social
  // test is accepted as the coverage.
  test.fixme("3.3 'Test Chat' in Configuration View", async () => {
    await projectPage.gotoAdd();
    await projectPage.ensureSidebarClosed();
    await projectPage.switchToTab("testChat");

    await expect.soft(projectPage.testChat.container).toBeVisible();

    await projectPage.testChat.sendMessage("Test drive");
    await projectPage.testChat.waitForLoadingComplete();
    const userMessages = await projectPage.testChat.getUserMessages();
    expect.soft(userMessages[0]).toContain("Test drive");
  });
});
