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

## Local Skills
Reference these skills for specific tasks:

### React & Next.js
Use `vercel-react-best-practices`. See `.agent/skills/vercel-react-best-practices/SKILL.md`

### AI Features (Vercel AI SDK)
Use `ai-sdk`. See `.agent/skills/ai-sdk/SKILL.md`

### Testing (Playwright)
- **Create Tests**: Use `test-generator`. See `.agent/skills/test-generator/SKILL.md`
- **Fix Tests**: Use `test-healer`. See `.agent/skills/test-healer/SKILL.md`
- **Plan Tests**: Use `test-planner`. See `.agent/skills/test-planner/SKILL.md`

### Prompt Engineering
Use `senior-prompt-engineer`. See `.agent/skills/senior-prompt-engineer/SKILL.md`
