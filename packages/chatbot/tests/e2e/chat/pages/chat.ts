import { Page, Locator } from "@playwright/test";
import { SidebarComponent } from "@/tests/e2e/chat/components/sidebar";
import { HeaderComponent } from "@/tests/e2e/chat/components/header";
import { ChatComponent } from "@/tests/e2e/chat/components/chat";

/**
 * Page Object Model for Chat functionality
 * Encapsulates chat page interactions and elements
 */
export class ChatPage {
  readonly page: Page;
  readonly header: HeaderComponent;
  readonly sidebar: SidebarComponent;
  readonly chat: ChatComponent;

  readonly dropdownBackdrop: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = new HeaderComponent(
      page.getByTestId("header-container").first()
    );
    this.sidebar = new SidebarComponent(
      page.getByTestId("sidebar-container").first()
    );
    this.chat = new ChatComponent(page.getByTestId("chat-container").first());
    this.dropdownBackdrop = page.getByTestId("backdrop");
  }

  async goto(chatId?: string) {
    const url = chatId ? `/chat/${chatId}` : "/";
    await this.page.goto(url);
  }

  async closeDropdown() {
    await this.dropdownBackdrop.click({ position: { x: 5, y: 5 } });
  }
}
