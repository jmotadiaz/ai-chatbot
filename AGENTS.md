---
trigger: always_on
---

# Agent Instructions

## Package Manager
Use **pnpm**: `pnpm install`, `pnpm dev`, `pnpm test`, `pnpm lint:fix`, `pnpm db:generate`

## Commit Attribution
AI commits MUST include:
```
Co-Authored-By: (the agent model's name and attribution byline)
```
Example: `Co-Authored-By: Claude Sonnet 3.5 <noreply@example.com>`

## Project Structure
- `app/`: Next.js App Router (routes & UI components).
- `lib/infrastructure/`: Infrastructure code (DB, AI).
- `lib/features/`: Feature code (Chat, Project, RAG, etc.).
- `components/`: UI components.
- `tests/`: End-to-end tests (Playwright)

## Development Rules
- **Linting**: Always run `pnpm lint:fix & npx next build` after changes.
- **Database**: Use Drizzle ORM. `pnpm db:generate && pnpm db:migrate` for migrations.
- **Styling**: Tailwind CSS + shadcn/ui. Support Dark/Light modes.
- **Components**:
    - Use `React.FC` with explicit prop interfaces.
    - Headless Component Pattern: Logic in hooks (on lib/features), UI in components (on app or components).

## Skills
FOR EACH USER REQUEST, invoke the corresponding skill (they are located in .agent/skills for workspace and ~/.gemini/antigravity/skills for global):
 - Create or Edit a React Component -> vercel-react-best-practices
 - Create or Edit a React Hook -> vercel-react-best-practices
 - Use any code from "ai" npm module -> ai-sdk
 - Implement a playwight test -> test-generator
 - Fix a failed playwight test or fix a flaky playwight test -> test-healer
 - Write an ai prompt → senior-prompt-engineer

## Tools
Always use Context7 MCP for code generation, setup, or configuration steps without me having to explicitly ask.

Here are the library IDs for the project’s tech stack to avoid calling resolveLibraryId in these cases:

- React: /websites/react_dev
- Nextjs: /websites/nextjs
- Postgres: /websites/postgresql_17
- Drizzle: /websites/orm_drizzle_team
- Tailwind: /websites/tailwindcss
- Vercel AI SDK: /websites/ai-sdk_dev

