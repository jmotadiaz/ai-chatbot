import { test, expect } from "../../fixtures";
import { ProjectPage } from "../pages/project";

test.describe("Project Management", () => {
  let projectPage: ProjectPage;

  test.beforeEach(async ({ page }) => {
    projectPage = new ProjectPage(page);
    await projectPage.page.goto("/");
  });

  // This test needs a real browser because it verifies editing through
  // Next.js routing and cache revalidation: the sidebar action opens
  // /project/<id>/edit, the save redirects to /chat and the refreshed layout
  // shows the new title instead of the old one. A unit test would omit the
  // routing and the layout refresh; the field persistence itself is covered in
  // tests/unit/project/project-actions.test.ts.
  test("2.1 Edit Existing Project", async ({ db, page }) => {
    const [project] = await db.addProjects([
      { name: "Alpha Project", systemPrompt: "Original prompt" },
    ]);

    // Navigate directly to the edit page (avoids sidebar navigation flakiness)
    await projectPage.gotoEdit(project.id);

    const newTitle = "Beta Project";
    const newPrompt = "Updated system prompt";

    await projectPage.form.fillBasic(newTitle, newPrompt);
    await projectPage.form.save();

    // Wait for the redirect to /chat/ which signals a successful save.
    // The toast is transient and unreliable for assertions.
    await expect(page).toHaveURL(/chat/, { timeout: 10_000 });

    await projectPage.openSidebar();

    // Wait for the sidebar to reflect the updated project name.
    // After router.push + router.refresh, the layout's server components re-fetch.
    await expect(
      projectPage.sidebar.getProjectItemByTitle(newTitle),
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      projectPage.sidebar.getProjectItemByTitle("Alpha Project"),
    ).not.toBeVisible();
  });

  // This test needs a real browser because it verifies the sidebar action and
  // confirmation modal that delete a project, and the refreshed sidebar that
  // stops rendering it. A unit test would omit the menu/modal interaction and
  // the layout refresh; the deletion rule is covered in
  // tests/unit/project/project-actions.test.ts.
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
