# Agent Instructions — chatbot

## Directory Structure

| Directory | Responsibility |
| --- | --- |
| `app/` | Next.js App Router: routes, pages & API routes |
| `app/(auth)/` | Auth flows (login, register) |
| `app/(chat)/` | Main chat UI, agent UI, projects, RAG, image editor |
| `app/(chat)/api/` | API routes (streaming, chat endpoints) |
| `components/` | Reusable UI components (shadcn/ui + Tailwind) |
| `lib/features/` | Feature domain modules (chat, code, project, rag, auth, memory, etc.) |
| `lib/infrastructure/` | Low-level infra: AI providers (`ai/`), database (`db/` — Drizzle + PostgreSQL) |
| `lib/utils/` | Shared utilities |
| `mcp-server/` | MCP (Model Context Protocol) server |
| `scripts/` | Utility scripts (seed, eval runner) |

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS + shadcn/ui. Support Dark/Light modes.
- **Database**: Drizzle ORM + PostgreSQL (+ pgvector for RAG)
- **Auth**: next-auth

## Development Conventions

- **Components**: Use `React.FC` with explicit prop interfaces. Headless Component Pattern — logic in hooks (`lib/features/`), UI in components (`app/` or `components/`).
- **Linting**: Run `pnpm lint:fix` after changes.
- **Database migrations**: `pnpm db:generate && pnpm db:migrate`.
