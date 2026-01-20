// spec: specs/projects.md
// seed: tests/e2e/chat/conversation.spec.ts

import { test, expect } from "../fixtures";
import { ProjectPage } from "./pages/project.page";

test.describe("Project Management", () => {
  let projectPage: ProjectPage;

  test.beforeEach(async ({ page, authenticatedUser }) => {
    expect(authenticatedUser.email).toBeDefined();
    projectPage = new ProjectPage(page);
  });

  test.describe("Creating a New Project", () => {
    test("Create Project with Minimum Valid Data", async ({ page }) => {
      await projectPage.gotoAdd();

      await projectPage.projectForm.fillTitle("Test Project");
      await projectPage.projectForm.fillPrompt("You are a helpful assistant.");

      await projectPage.saveProject();

      await expect(
        page.getByText("Project created successfully!"),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/project\/.*\/chat/);
      await expect(
        page.getByRole("heading", { name: "Test Project" }),
      ).toBeVisible();
    });

    test("Create Project with All Tools Enabled", async ({ page }) => {
      await projectPage.gotoAdd();

      await projectPage.projectForm.fillTitle("Full Featured Project");
      await projectPage.projectForm.selectModel("Llama 4 Scout");
      await projectPage.projectForm.fillPrompt(
        "You are an expert assistant with access to tools.",
      );

      await projectPage.projectForm.expandAdvanced();

      await projectPage.projectForm.toggleTool("rag");
      await projectPage.projectForm.toggleTool("web-search");
      await projectPage.projectForm.toggleTool("refine-prompt");

      await projectPage.projectForm.setTemperature(0.8);

      await projectPage.saveProject();

      await expect(
        page.getByText("Project created successfully!"),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/project\/.*\/chat/);
      await expect(
        page.getByRole("heading", { name: "Full Featured Project" }),
      ).toBeVisible();
    });

    test("Attempt to Create Project with Empty Title", async ({ page }) => {
      await projectPage.gotoAdd();

      // Leave title empty
      await projectPage.projectForm.fillPrompt("You are a helpful assistant.");

      await projectPage.saveProject();

      // Expect validation error
      await expect(
        page.getByText(
          "Please fill in required fields (Title and System Prompt)",
        ),
      ).toBeVisible();
      await expect(page).toHaveURL("/project/add");
    });

    test("Create Project with Very Long Title", async ({ page }) => {
      const longTitle = "A".repeat(250);

      await projectPage.gotoAdd();

      await projectPage.projectForm.fillTitle(longTitle);
      await projectPage.projectForm.fillPrompt("You are a helpful assistant.");

      await projectPage.saveProject();

      await expect(
        page.getByText("Project created successfully!"),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/project\/.*\/chat/);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        longTitle.substring(0, 50),
      ); // Assuming truncated
    });
  });

  test.describe("Editing Existing Projects", () => {
    test("Edit Project Basic Settings", async ({ page, db }) => {
      // Create project via DB
      const [testProject] = await db.addProjects([
        { name: "Edit Test Project", systemPrompt: "You are editable." },
      ]);

      await projectPage.gotoEdit(testProject.id);

      await projectPage.projectForm.fillTitle("Updated Edit Test Project");
      await projectPage.projectForm.selectModel("Llama 4 Scout");
      await projectPage.projectForm.fillPrompt("You are updated.");

      await projectPage.saveProject();

      await expect(
        page.getByText("Project updated successfully!"),
      ).toBeVisible();
    });

    test("Test Chat Functionality in Edit Mode", async ({ page, db }) => {
      // Create project via DB
      const [testProject] = await db.addProjects([
        { name: "Chat Test Project", systemPrompt: "You are for chat test." },
      ]);

      await projectPage.gotoEdit(testProject.id);

      // Switch to test chat
      await page.getByRole("button", { name: "Test Chat" }).click();

      await page
        .getByRole("textbox", { name: "Say something..." })
        .fill("Hello test");
      await page.getByRole("button", { name: "Send message" }).click();

      // Verify message was sent
      await expect(
        page.getByRole("textbox", { name: "Say something..." }),
      ).toHaveValue("");
    });

    test("Modify Tool Configuration", async ({ page, db }) => {
      // Create project via DB
      const [testProject] = await db.addProjects([
        { name: "Tool Test Project", systemPrompt: "You are for tool test." },
      ]);

      await projectPage.gotoEdit(testProject.id);

      await projectPage.projectForm.expandAdvanced();
      await projectPage.projectForm.toggleTool("rag");
      await projectPage.projectForm.setTemperature(0.5);

      await projectPage.saveProject();

      await expect(
        page.getByText("Project updated successfully!"),
      ).toBeVisible();
    });
  });

  test.describe("Project Navigation and Management", () => {
    test("Start Permanent Chat from Project", async ({ page, db }) => {
      // Create project via DB
      await db.addProjects([
        { name: "Nav Project", systemPrompt: "Navigate me." },
      ]);

      await projectPage.gotoHome();
      await projectPage.header.toggleSidebar();
      await projectPage.sidebar.clickStartChat("Nav Project");

      await expect(page).toHaveURL(/\/project\/.*\/chat/);
    });

    test("Start Temporary Chat from Project", async ({ page, db }) => {
      // Create project via DB
      await db.addProjects([
        { name: "Nav Project Temp", systemPrompt: "Navigate me." },
      ]);

      await projectPage.gotoHome();
      await projectPage.header.toggleSidebar();
      await projectPage.sidebar.clickTemporaryChat("Nav Project Temp");

      await expect(page).toHaveURL(/.*chatType=temporary/);
    });

    test("Delete Project", async ({ page, db }) => {
      // Create project via DB
      await db.addProjects([
        { name: "Nav Project Del", systemPrompt: "Navigate me." },
      ]);

      await projectPage.gotoHome();
      await projectPage.header.toggleSidebar();
      await projectPage.sidebar.clickDelete("Nav Project Del");

      // Confirm modal
      await page.getByRole("button", { name: "Delete" }).click();

      await expect(
        page.getByRole("button").filter({ hasText: "Nav Project Del" }),
      ).not.toBeVisible();
    });
  });

  // Add more describes for Edge Cases, Responsive Design as needed
});
