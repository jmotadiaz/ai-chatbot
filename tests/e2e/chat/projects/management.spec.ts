import { test, expect } from "../../fixtures";
import { ProjectPage } from "../pages/project";

test.describe("Project Management", () => {
  let projectPage: ProjectPage;

  test.beforeEach(async ({ page }) => {
    projectPage = new ProjectPage(page);
    await projectPage.page.goto("/");
  });

  test("2.1 Edit Existing Project", async ({ db, page }) => {
    const [project] = await db.addProjects([
      { name: "Alpha Project", systemPrompt: "Original prompt" },
    ]);

    await page.reload();
    await projectPage.openSidebar();
    await projectPage.sidebar.navigateProjectAction(project.name, "edit");

    await expect(page).toHaveURL(/edit/);
    await projectPage.ensureSidebarClosed();
    const newTitle = "Beta Project";
    const newPrompt = "Updated system prompt";

    await projectPage.form.fillBasic(newTitle, newPrompt);
    await projectPage.form.save();

    // Verify successful update notification
    await expect(page.getByText("Project updated successfully!")).toBeVisible();
    await expect(page).toHaveURL(/chat/);

    await projectPage.openSidebar();

    // Check for new title first
    await expect
      .soft(projectPage.sidebar.getProjectItemByTitle(newTitle))
      .toBeVisible();

    // Ensure old title is gone
    await expect
      .soft(projectPage.sidebar.getProjectItemByTitle("Alpha Project"))
      .not.toBeVisible();
  });

  test("2.2 Delete Project", async ({ db, page }) => {
    const [project] = await db.addProjects([
      { name: "Delete Me", systemPrompt: "To be deleted" },
    ]);

    await page.reload();
    await projectPage.openSidebar();
    await projectPage.sidebar.navigateProjectAction(project.name, "delete");

    // Click confirm in modal
    await projectPage.sidebar.confirmModal.confirm();

    await expect
      .soft(projectPage.sidebar.getProjectItemByTitle(project.name))
      .not.toBeVisible();
  });
});
