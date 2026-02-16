---
trigger: always_on
---

# Agent Instructions


## Pre-flight Checklist (MANDATORY — execute BEFORE any other action)

Before researching files, planning, or writing any code, you MUST complete these two steps in order:

### Step 1: Skill Routing

Evaluate the user request against EVERY rule below. If ANY rule matches, read the corresponding SKILL.md file FIRST. Multiple rules can match — load all that apply.

| If the request output touches… | Load this skill |
|---|---|
| A React component (create, modify, refactor, extract, delete) | `.agent/skills/vercel-react-best-practices/SKILL.md` |
| A React hook (create, modify, refactor) | `.agent/skills/vercel-react-best-practices/SKILL.md` |
| The `ai` npm module | `.agent/skills/ai-sdk/SKILL.md` |
| Implementing a Playwright test | `.agent/skills/test-generator/SKILL.md` |
| Fixing a Playwright test | `.agent/skills/test-healer/SKILL.md` |
| Planning Playwright tests | `.agent/skills/test-planner/SKILL.md` |
| Writing or optimizing an AI prompt | `.agent/skills/senior-prompt-engineer/SKILL.md` |

### Step 2: Context7 MCP

Consult Context7 for any code generation or configuration task. Use the pre-resolved library IDs in the table below:

| Library | ID |
|---------|------|
| React | `/websites/react_dev` |
| Next.js | `/vercel/next.js` |
| Postgres | `/websites/postgresql_17` |
| Drizzle | `/drizzle-team/drizzle-orm-docs` |
| Tailwind | `/websites/tailwindcss` |
| Vercel AI SDK | `/vercel/ai` |

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
