# GEMINI.md

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
2.  **Start the database:**
    ```bash
    pnpm run db:start
    ```
3.  **Run the development server:**
    ```bash
    pnpm run dev
    ```

### Build

```bash
pnpm run build
```

### Testing

```bash
pnpm run test
```

## Development Conventions

*   **Linting:** The project uses ESLint and Prettier for code formatting and linting. Run `pnpm run lint:fix` to check for issues.
*   **Database Migrations:** Database schema changes are managed with Drizzle Kit. Use `pnpm run db:generate` to create new migrations.
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

* Use Page Objects pattern for Playwright tests to enhance maintainability.
  * Page classes uses composition with separated classes for component (eg. sidebar.component.ts).
  * The constructor of the component classes should receive a Locator of its container.
  * Specs should use components through page objects only.
* For locators, prefer using getByRole and getByLabel with accessible names. Use getByTestId only when no other option is available.
  * When no proper selector is available in the source code, add one following the previous rule.
* Asserts should be in spec files using soft assertions
* expects to be used in page objects only for waiting for elements to be visible or actions to be completed.
