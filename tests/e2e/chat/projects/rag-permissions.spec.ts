import { test, expect } from "../../fixtures";
import { ProjectPage } from "../pages/project";
import { ChatPage } from "../pages/chat";

test.describe("Project Chat - RAG Permissions", () => {
  let projectPage: ProjectPage;
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    projectPage = new ProjectPage(page);
    chatPage = new ChatPage(page);
    await projectPage.page.goto("/");
  });

  test("Project with empty tools should work correctly", async ({ db, page }) => {
    const title = "No RAG Project";

    await db.addProjects([
      {
        name: title,
        systemPrompt: "You are a helpful assistant.",
        tools: [], // No tools
      },
    ]);

    await page.reload();
    await projectPage.openSidebar();
    await projectPage.sidebar.navigateProjectAction(title, "chat");

    // Wait for URL to match project chat pattern
    await expect(page).toHaveURL(/\/project\/.*\/chat/);
    await projectPage.ensureSidebarClosed();

    await chatPage.chat.sendMessage("Hello");
    await chatPage.chat.waitForLoadingComplete();

    const lastMessage = await chatPage.chat.getLastAssistantMessage();
    expect(lastMessage).toBeTruthy();
  });

  test("Project with RAG tool should work correctly", async ({ db, page }) => {
    const title = "RAG Project";

    await db.addProjects([
      {
        name: title,
        systemPrompt: "You are a helpful assistant.",
        tools: ["rag"], // RAG tool enabled
      },
    ]);

    await page.reload();
    await projectPage.openSidebar();
    await projectPage.sidebar.navigateProjectAction(title, "chat");

    await expect(page).toHaveURL(/\/project\/.*\/chat/);
    await projectPage.ensureSidebarClosed();

    await chatPage.chat.sendMessage("Hello");
    await chatPage.chat.waitForLoadingComplete();

    const lastMessage = await chatPage.chat.getLastAssistantMessage();
    expect(lastMessage).toBeTruthy();
  });
});
