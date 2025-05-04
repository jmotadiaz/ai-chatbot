# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands
- Development: `pnpm dev` or `npm run dev`
- Build: `pnpm build` or `npm run build`
- Start: `pnpm start` or `npm run start`
- Lint: `pnpm lint` or `npm run lint`

## Code Style Guidelines
- TypeScript with strict type checking
- Next.js App Router architecture with React 19
- PascalCase for component names, camelCase for functions/variables
- kebab-case for file names
- Use named exports for components
- Follow ESLint Next.js core-web-vitals and TypeScript rules
- Use Tailwind CSS for styling with proper class organization
- Path aliases: import from `@/components`, `@/lib/utils`, etc.
- Functional components with hooks (avoid class components)
- Use try/catch for error handling with appropriate status codes
- Error handling in UI components using toast notifications
- Components should be properly typed with explicit prop interfaces
- Use shadcn/ui component patterns with destructured props
- Ensure responsive design across all components