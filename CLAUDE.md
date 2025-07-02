# Project: AI Chatbot Nextjs App

## Build Commands
- Development: `pnpm dev`
- Build: `pnpm build`
- Start: `pnpm start`
- Lint: `pnpm lint:fix`

## Code Style Guidelines
- TypeScript with strict type checking
- Next.js App Router architecture with React 19
- PascalCase for component names, camelCase for functions/variables
- kebab-case for file names
- Use named exports for components
- Follow ESLint Next.js core-web-vitals and TypeScript rules
- Use Tailwind CSS for styling with proper class organization
- Path aliases: import from `@/components`, `@/lib/utils`, instead of relative imports.
- Functional components with hooks (avoid class components)
- Use try/catch for error handling with appropriate status codes
- Error handling in UI components using toast notifications
- Components should be properly typed using using React.FC with explicit prop interfaces
- UI Components shouldn't have logic. the logic should be in a hook and the result of the hook should be the props of the component (Headless Components Pattern)
    - Example:
      ```
        const dropdownProps = useDropdown();
        return <Dropdown {...dropdownProps} />
      ```
- Ensure responsive design across all components. Ensure light and dark theme across all components

## Regarding Dependencies:
- If a new dependency is required, please state the reason.
