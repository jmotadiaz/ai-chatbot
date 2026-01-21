import { test, expect } from "../../fixtures";
import { ProjectPage } from "../pages/project";

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

    await projectPage.form.fillBasic(title, systemPrompt);
    await projectPage.form.save();

    // Expected Results:
    // - User is redirected to the newly created project chat
    await expect.soft(page).toHaveURL(/\/project\/.*\/chat/);

    // - The project 'Alpha Project' appears in the sidebar
    await projectPage.ensureSidebarOpen();
    await expect
      .soft(projectPage.sidebar.getProjectItemByTitle(title))
      .toBeVisible();
  });

  test("1.2 Create Project with Advanced Configuration", async ({ page }) => {
    const title = "Advanced Project";
    const systemPrompt = "Testing advanced settings.";

    await projectPage.form.fillBasic(title, systemPrompt);
    await projectPage.form.toggleWebSearch(true);

    await projectPage.form.expandAdvanced();

    // Set Temperature to 0.8
    await projectPage.form.temperatureSelector.increment();
    await projectPage.form.temperatureSelector.increment();

    // Web Search Results (should be visible now)
    await projectPage.form.webSearchResultsSelector.increment();

    await projectPage.form.save();

    await expect.soft(page).toHaveURL(/\/project\/.*\/chat/);

    await projectPage.ensureSidebarOpen();
    await expect
      .soft(projectPage.sidebar.getProjectItemByTitle(title))
      .toBeVisible();
  });

  test("1.3 Validation: Mandatory Fields", async ({ page }) => {
    await projectPage.form.save();
    await expect
      .soft(page.getByText("Please fill in required fields"))
      .toBeVisible();
    await expect.soft(page).toHaveURL(/\/project\/add/);
  });
});
