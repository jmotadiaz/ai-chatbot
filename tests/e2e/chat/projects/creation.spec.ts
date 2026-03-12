import { test, expect } from "../../fixtures";
import { ProjectPage } from "../pages/project";
import { ChatComponent } from "../components/chat";

test.describe("Project Creation", () => {
  let projectPage: ProjectPage;

  test.beforeEach(async ({ page }) => {
    projectPage = new ProjectPage(page);
    await projectPage.gotoAdd();
    await projectPage.ensureSidebarClosed();
  });

  test("1.1 Create Valid Project with Basic Settings", async ({ page }) => {
    const title = "Alpha Project";
    const systemPrompt = "You are a specialized research assistant.";

    await projectPage.openSidebar();
    await expect
      .soft(projectPage.sidebar.getProjectItemByTitle("Untitled Project"))
      .not.toBeVisible();
    await projectPage.ensureSidebarClosed();

    await projectPage.form.fillBasic(title, systemPrompt);
    await projectPage.form.save();

    // Expected Results:
    // - User is redirected to the newly created project chat
    await expect.soft(page).toHaveURL(/\/project\/.*\/chat/);

    // - The project 'Alpha Project' appears in the sidebar
    await projectPage.openSidebar();
    await expect
      .soft(projectPage.sidebar.getProjectItemByTitle(title))
      .toBeVisible();
  });

  test.skip("1.2 Create Project with Advanced Configuration", async ({
    page,
  }) => {
    const title = "Advanced Project";
    const systemPrompt = "Testing advanced settings.";

    await projectPage.form.fillBasic(title, systemPrompt);
    // await projectPage.form.toggleWebSearch(true); // Web search removed

    await projectPage.form.expandAdvanced();

    // Set Temperature to 0.8
    await projectPage.form.temperatureSelector.increment();
    await projectPage.form.temperatureSelector.increment();

    // Web Search Results (should be visible now)
    // await projectPage.form.webSearchResultsSelector.increment(); // Web Search config removed

    await projectPage.form.save();

    await expect.soft(page).toHaveURL(/\/project\/.*\/chat/);

    await projectPage.openSidebar();
    await expect
      .soft(projectPage.sidebar.getProjectItemByTitle(title))
      .toBeVisible();

    // Verify Active Tools Pill behavior
    // RAG should be hidden (filtered out for projects), Web Search should be visible
    const chat = new ChatComponent(page.getByTestId("chat-container").first());
    await expect
      .soft(chat.container.getByTestId("active-tool-pill-rag"))
      .not.toBeVisible();
    // await expect
    //   .soft(chat.container.getByTestId("active-tool-pill-webSearch"))
    //   .toBeVisible(); // Web Search disabled by default
  });
});
