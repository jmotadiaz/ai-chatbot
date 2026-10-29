import { test, expect } from "../../fixtures";
import { ProjectPage } from "../pages/project";

test.describe("Project Creation", () => {
  let projectPage: ProjectPage;

  test.beforeEach(async ({ page }) => {
    projectPage = new ProjectPage(page);
    await projectPage.gotoAdd();
    await projectPage.ensureSidebarClosed();
  });

  // This test needs a real browser because it verifies the creation journey
  // through Next.js itself: /project/<newId>/add, the server action that
  // activates the draft project, the redirect to /project/<id>/chat and the
  // sidebar re-fetch that makes the new title visible. A unit test would omit
  // the routing, the redirect and the refreshed layout.
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
});
