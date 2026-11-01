import { Locator } from "@playwright/test";
import { ConfirmModalComponent } from "./confirm-modal";

/**
 * Component Object Model for Sidebar functionality
 * Encapsulates sidebar interactions and elements
 */
export class SidebarComponent {
  readonly container: Locator;
  // Sidebar elements
  readonly chatList: Locator;
  readonly projectList: Locator;
  readonly addProjectButton: Locator;
  readonly confirmModal: ConfirmModalComponent;
  readonly newChatLink: Locator;
  readonly newTemporaryChatLink: Locator;

  constructor(container: Locator) {
    this.container = container;

    this.chatList = container.getByRole("list", { name: "Chat history" });
    this.projectList = container.getByRole("list", { name: "Projects" });
    this.addProjectButton = container.getByRole("link", { name: "Projects" });
    this.confirmModal = new ConfirmModalComponent(container);
    // The section header renders even when the user has no chats. The solid
    // action is the "Chats" label itself (as the search shortcut used to be),
    // so it is found by its visible name; the dashed one is scoped by test id
    // because an expanded project renders the same label for its own actions.
    const sectionHeader = container.getByTestId("chats-section-header");
    this.newChatLink = sectionHeader.getByRole("link", {
      name: "Chats",
      exact: true,
    });
    this.newTemporaryChatLink = container
      .getByTestId("chats-section-actions")
      .getByLabel("New temporary chat", { exact: true });
  }

  /**
   * Get all chat titles from the sidebar
   */
  getChatItemByTitle(title: string): Locator {
    // Use .first() because sidebar creates animation clones with opacity-0
    return this.chatList
      .getByRole("listitem")
      .filter({ hasText: title })
      .first();
  }

  /**
   * Delete a chat by its title
   * @param title The title of the chat to delete
   */
  async deleteChat(title: string) {
    await this.getChatItemByTitle(title).getByLabel("Delete chat").click();
  }

  /**
   * Click on a chat in the sidebar by its title
   * @param title The title of the chat to click
   */
  async clickChatByTitle(title: string) {
    await this.chatList.getByText(title, { exact: true }).click();
  }

  /**
   * Get a project item in the sidebar by its title
   * @param title The title of the project
   */
  getProjectItemByTitle(title: string): Locator {
    return this.container
      .getByTestId("project-item-toggle")
      .filter({ hasText: title })
      .first();
  }

  /**
   * Click a specific action for a project
   * @param title The title of the project
   * @param action The action to perform ('chat', 'temporary-chat', 'edit', 'delete')
   */
  async navigateProjectAction(
    title: string,
    action: "chat" | "temporary-chat" | "edit" | "delete",
  ) {
    const projectItem = this.getProjectItemByTitle(title);

    // Check if it's already expanded
    const isExpanded = await projectItem.getAttribute("aria-expanded");
    if (isExpanded !== "true") {
      await projectItem.click();
    }

    // Wait for the panel to be visible to avoid interception/stability issues
    const ariaControls = await projectItem.getAttribute("aria-controls");
    const panel = this.container.page().locator(`#${ariaControls}`);
    await panel.waitFor({ state: "visible" });

    switch (action) {
      case "chat":
        await panel.getByLabel("New chat", { exact: true }).first().click();
        break;
      case "temporary-chat":
        await panel
          .getByLabel("New temporary chat", { exact: true })
          .first()
          .click();
        break;
      case "edit":
        await panel.getByLabel("Edit project").first().click();
        break;
      case "delete":
        await panel.getByLabel("Delete project").first().click();
        break;
    }
  }

  /**
   * Click the 'Add New Project' button (+)
   */
  async clickAddProject() {
    await this.addProjectButton.click();
  }
}
