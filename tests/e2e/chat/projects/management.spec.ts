import { test, expect } from "../../fixtures";
import { ProjectPage } from "../pages/project";

test.describe("Project Management", () => {
  let projectPage: ProjectPage;

  test.beforeEach(async ({ page }) => {
    projectPage = new ProjectPage(page);
    await projectPage.page.goto("/");
  });

  test("2.1 Edit Existing Project", async ({ db }) => {
    const [project] = await db.addProjects([
      { name: "Alpha Project", systemPrompt: "Original prompt" },
    ]);

    await projectPage.page.reload();
    await projectPage.ensureSidebarOpen();
    await projectPage.sidebar.navigateProjectAction(project.name, "edit");

    await expect(projectPage.page).toHaveURL(/edit/);
    await projectPage.ensureSidebarClosed();
    const newTitle = "Beta Project";
    const newPrompt = "Updated system prompt";

    await projectPage.form.fillBasic(newTitle, newPrompt);
    await projectPage.form.save();

    await projectPage.ensureSidebarOpen();
    await expect
      .soft(projectPage.sidebar.getProjectItemByTitle(newTitle))
      .toBeVisible();
    await expect
      .soft(projectPage.sidebar.getProjectItemByTitle("Alpha Project"))
      .not.toBeVisible();
  });

  test("2.2 Delete Project", async ({ db }) => {
    const [project] = await db.addProjects([
      { name: "Delete Me", systemPrompt: "To be deleted" },
    ]);

    await projectPage.page.reload();
    await projectPage.ensureSidebarOpen();
    await projectPage.sidebar.navigateProjectAction(project.name, "delete");

    // Click confirm in modal
    await projectPage.sidebar.confirmModal.confirm();

    await expect
      .soft(projectPage.sidebar.getProjectItemByTitle(project.name))
      .not.toBeVisible();
  });
});
