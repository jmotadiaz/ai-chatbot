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

  test("3.1 Standard Project Chat", async ({ db, page }) => {
    const title = "Research Assistant";
    const expectedResponse = "Hello, I'm meta/llama-4-scout";

    await db.addProjects([
      {
        name: title,
        systemPrompt: "Special prompt",
        defaultModel: "Llama 4 Scout",
      },
    ]);

    await page.reload();
    await projectPage.ensureSidebarOpen();
    await projectPage.sidebar.navigateProjectAction(title, "chat");

    // Wait for project chat to load
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await projectPage.ensureSidebarClosed();

    await chatPage.chat.sendMessage("Hi");
    await chatPage.chat.waitForLoadingComplete();

    const lastMessage = await chatPage.chat.getLastAssistantMessage();
    expect.soft(lastMessage).toContain(expectedResponse);
  });

  test("3.2 Temporary Project Chat", async ({ db, page }) => {
    const title = "Temp Project";
    await db.addProjects([{ name: title, systemPrompt: "Temp prompt" }]);

    await page.reload();
    await projectPage.ensureSidebarOpen();
    await projectPage.sidebar.navigateProjectAction(title, "temporary-chat");

    // Wait for project chat to load
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await projectPage.ensureSidebarClosed();
    await expect.soft(page).toHaveURL(/chatType=temporary/);

    await chatPage.chat.sendMessage("Temporary message");
    await chatPage.chat.waitForLoadingComplete();

    // If we navigate away and back, it should be gone (non-persisted)
    await page.goto("/");
    await projectPage.ensureSidebarOpen();
    await projectPage.sidebar.navigateProjectAction(title, "chat"); // Back to normal chat

    await projectPage.ensureSidebarClosed();
    const userMessages = await chatPage.chat.getUserMessages();
    expect.soft(userMessages.length).toBe(0);
  });

  test("3.3 'Test Chat' in Configuration View", async () => {
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
