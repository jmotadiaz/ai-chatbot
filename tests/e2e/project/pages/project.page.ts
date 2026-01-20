import { Page } from "@playwright/test";
import { ProjectFormComponent } from "../components/project-form";
import { ChatComponent } from "../../chat/components/chat";
import { ProjectListComponent } from "../components/project-list";
import { HeaderComponent } from "../../chat/components/header";

/**
 * Page Object Model for Project functionality
 * Encapsulates project creation and editing page interactions
 */
export class ProjectPage {
  readonly page: Page;
  readonly projectForm: ProjectFormComponent;
  readonly testChat: ChatComponent;
  readonly sidebar: ProjectListComponent;
  readonly header: HeaderComponent;

  constructor(page: Page) {
    this.page = page;
    this.projectForm = new ProjectFormComponent(page);
    this.testChat = new ChatComponent(page.getByTestId("test-chat-container"));
    this.sidebar = new ProjectListComponent(
      page.getByTestId("sidebar-container"),
    );
    this.header = new HeaderComponent(page.getByTestId("header-container"));
  }

  async gotoAdd() {
    await this.page.goto("/project/add");
  }

  async gotoEdit(projectId: string) {
    await this.page.goto(`/project/${projectId}/edit`);
  }

  async gotoChat(projectId: string, chatType?: "permanent" | "temporary") {
    const url =
      chatType === "temporary"
        ? `/project/${projectId}/chat?chatType=temporary`
        : `/project/${projectId}/chat`;
    await this.page.goto(url);
  }

  async gotoHome() {
    await this.page.goto("/");
  }

  async saveProject() {
    await this.projectForm.save();
  }
}
