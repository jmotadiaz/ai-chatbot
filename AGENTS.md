# GEMINI.md

## CRITICAL
Say "Hola javier" at the beginning of every message.

## Project Overview

This is a Next.js-based AI chatbot application. It uses the Vercel AI SDK to interact with various AI models and a PostgreSQL database with Drizzle ORM for data persistence. The application supports user authentication, project-based chat organization, and Retrieval-Augmented Generation (RAG) with embedding capabilities. The frontend is built with React and Tailwind CSS.

### Key Technologies

*   **Framework:** Next.js
*   **AI:** Vercel AI SDK, Groq, OpenAI, Anthropic, etc.
*   **Database:** PostgreSQL with Drizzle ORM
*   **UI:** React, Tailwind CSS, shadcn/ui
*   **Testing:** Playwright for end-to-end testing

### Architecture

The application follows a standard Next.js App Router structure.
*   The `app` directory contains the different routes and UI components.
*   The `lib` directory contains the core logic, including database schema and queries, AI model interactions, and authentication.
*   The `components` directory contains the reusable UI components.
*   The `tests` directory contains end-to-end tests.

## Building and Running

### Prerequisites

*   Node.js and pnpm
*   Docker
*   Vercel CLI

### Development

1.  **Install dependencies:**
    ```bash
    pnpm install
    ```
2.  **Run the development server:**
    ```bash
    pnpm dev
    ```

### Build

```bash
pnpm build
```

### Testing

```bash
pnpm test
```

## Development Conventions

*   **Linting:** The project uses ESLint and Prettier for code formatting and linting. Run `pnpm lint:fix` to check for issues.
*   **Database Migrations:** Database schema changes are managed with Drizzle Kit. Use `pnpm db:generate` to create new migrations.
*   **Testing:** End-to-end tests are written with Playwright.
*   **Path Aliases:** Use path aliases for imports, such as `@/components`, `@/lib/utils`, instead of relative imports.

### Components Guidelines

* Components should be properly typed using using React.FC with explicit prop interfaces
  * When no props are needed, use `React.FC` without an interface
* UI Components shouldn't have logic. the logic should be in a hook and the result of the hook should be the props of the component (Headless Components Pattern)
  * Example:
    ```
      const dropdownProps = useDropdown();
      return <Dropdown {...dropdownProps} />
    ```
* Ensure responsive design across all components. Ensure light and dark theme across all components

### Testing Guidelines

#### E2E Testing Architecture

The project uses Playwright for end-to-end testing with a component-based Page Object pattern that promotes reusability and maintainability.

#### Page Object Pattern with Component Composition

**Core Principles:**
* **Page Objects** represent entire pages and compose multiple components
* **Component Objects** represent reusable UI sections that can be shared across pages
* **Component composition** allows components to contain other components, creating a hierarchical structure
* All components receive a `Locator` container in their constructor, enabling flexible composition

**Page Object Structure:**
```typescript
// tests/e2e/chat/page.ts
export class ChatPage {
  readonly page: Page;
  readonly header: HeaderComponent;
  readonly sidebar: SidebarComponent;
  readonly chat: ChatComponent;

  constructor(page: Page) {
    this.page = page;
    // Components receive their container Locator
    this.header = new HeaderComponent(page.getByTestId("header-container"));
    this.sidebar = new SidebarComponent(page.getByTestId("sidebar-container"));
    this.chat = new ChatComponent(page.getByTestId("chat-container"));
  }

  async goto(chatId?: string) {
    await this.page.goto(chatId ? `/${chatId}` : "/");
  }
}
```

**Component Object Structure:**
```typescript
// tests/e2e/chat/sidebar.component.ts
export class SidebarComponent {
  readonly container: Locator;
  readonly chatList: Locator;

  constructor(container: Locator) {
    this.container = container;
    // All selectors are scoped to the container
    this.chatList = container.getByRole("list", { name: "Chat history" });
  }

  getChatItemByTitle(title: string): Locator {
    return this.chatList
      .getByText(title, { exact: true })
      .locator('xpath=ancestor::div[@role="listitem"]');
  }

  async clickChatByTitle(title: string) {
    await this.chatList.getByText(title, { exact: true }).click();
  }
}
```

**Component Composition Pattern:**

Components can compose other components, creating a nested hierarchy:

```typescript
// tests/e2e/chat/chat.component.ts
export class ChatComponent {
  readonly container: Locator;
  readonly chatInput: Locator;
  readonly tools: ToolsComponent;
  readonly settings: SettingsComponent;

  constructor(container: Locator) {
    this.container = container;
    this.chatInput = container.getByTestId("chat-input");

    // Nested components receive sub-containers
    this.tools = new ToolsComponent(container);
    this.settings = new SettingsComponent(container);
  }

  async sendMessage(message: string) {
    await this.chatInput.fill(message);
    await this.container.getByLabel("Send message").click();
  }
}

// tests/e2e/chat/tools.component.ts
export class ToolsComponent {
  readonly container: Locator;
  readonly ragToolLabel: Locator;

  constructor(container: Locator) {
    this.container = container;
    // Scoped to parent's container
    this.ragToolLabel = container.locator('label[for="rag-tool"]');
  }

  async toggleTool(toolName: "rag" | "web-search") {
    await this.ragToolLabel.click();
  }
}
```

**Benefits of Component Composition:**
* Components are **reusable** across different pages
* Components can be **composed** by pages or other components
* All selectors are **scoped** to their container, preventing conflicts
* Changes to a component are **isolated** and affect all uses automatically

#### Locator Strategy

**Priority Order:**
1. **getByRole** with accessible name (preferred for semantic elements)
   ```typescript
   container.getByRole("button", { name: "Submit" })
   container.getByRole("list", { name: "Chat history" })
   ```

2. **getByLabel** for form inputs
   ```typescript
   container.getByLabel("Temperature")
   container.getByLabel("Toggle sidebar")
   ```

3. **getByTestId** as last resort when semantic selectors aren't available
   ```typescript
   container.getByTestId("chat-input")
   ```

**Exception for getByTestId:**
Using `getByTestId` is perfectly acceptable and recommended for **component containers** in Page Objects, as it provides stable references for composition:
```typescript
// Acceptable use of getByTestId for containers
this.header = new HeaderComponent(page.getByTestId("header-container"));
this.sidebar = new SidebarComponent(page.getByTestId("sidebar-container"));
this.chat = new ChatComponent(page.getByTestId("chat-container"));
```

**When to Add Selectors:**
If a proper semantic selector isn't available in the source code, add one following the priority order above (role/label preferred over test-id).

#### Spec File Structure

**Specs should:**
* Only interact with Page Objects and their composed components
* Use **soft assertions** for multiple checks in a single test
* Keep test logic in the spec, not in page objects

```typescript
// tests/e2e/chat/sidebar.spec.ts
import { test, expect } from "../fixtures";
import { ChatPage } from "./page";

test.describe("Chat Sidebar", () => {
  test("should display and navigate chats", async ({ page }) => {
    const chatPage = new ChatPage(page);
    await chatPage.goto();

    // Access nested components through page object
    await chatPage.header.toggleSidebar();

    // Soft assertions allow test to continue after failures
    await expect.soft(chatPage.sidebar.getChatItemByTitle("Chat 1")).toBeVisible();
    await expect.soft(chatPage.sidebar.getChatItemByTitle("Chat 2")).toBeVisible();

    await chatPage.sidebar.clickChatByTitle("Chat 2");
    await expect.soft(page.getByText("Chat content")).toBeVisible();
  });
});
```

#### Assertions Guidelines

* **Spec files:** Use soft assertions (`expect.soft()`) to continue test execution after failures
  ```typescript
  await expect.soft(element1).toBeVisible();
  await expect.soft(element2).toHaveText("expected");
  ```

* **Page Objects/Components:** Use `expect()` only for waiting/synchronization purposes
  ```typescript
  async waitForLoadingComplete() {
    await this.loadingIndicator.waitFor({ state: "attached" });
    await this.loadingIndicator.waitFor({ state: "detached" });
  }
  ```

#### Summary

* **Pages** compose **Components** via container Locators
* **Components** can compose other **Components** (nested composition)
* All selectors scoped to container enable isolation and reusability
* Prefer semantic selectors (role, label) over test-ids
* Specs use soft assertions and interact only through page objects
