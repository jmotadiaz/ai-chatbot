# OLED Pure-Black Dark Theme

## Goal

Adjust the existing **dark** theme so the main background is pure black (`#000000`),
optimized for OLED/AMOLED panels, while elevated surfaces (cards, popovers, inputs,
sidebar, modals) drop to a *very dark gray* instead of the current mid-gray to
preserve depth and hierarchy without breaking the black effect.

## Scope decisions (from brainstorming)

- **Modify the existing dark theme in place.** No new "AMOLED" theme mode, no
  component-by-component rework. Light theme is untouched.
- Main background `--background` → pure black `#000000` (`oklch(0 0 0)`).
- Elevated surfaces → very dark gray `#17171a` (`oklch(0.206 0.006 285.9)`),
  ~23 points of luminance below today's `#242428`.
- Sidebar → same `#17171a` (the sidebar container actually uses `bg-secondary`, so
  it is covered by the `--secondary` token change; no separate sidebar work needed).
- Browser chrome `<meta name="theme-color">` → `#000000` so the URL bar blends with
  the background.

## Implementation

### 1. `packages/chatbot/app/globals.css` — `[data-color-mode='dark']` block

| Token | Current | New |
|---|---|---|
| `--background` | `oklch(0.200 0.005 285.823)` (`#161618`) | `oklch(0 0 0)` (`#000000`) |
| `--card` | `oklch(0.274 0.006 286.033)` | `oklch(0.206 0.006 285.9)` |
| `--popover` | `oklch(0.274 0.006 286.033)` | `oklch(0.206 0.006 285.9)` |
| `--secondary` | `oklch(0.274 0.006 286.033)` | `oklch(0.206 0.006 285.9)` |
| `--muted` | `oklch(0.274 0.006 286.033)` | `oklch(0.206 0.006 285.9)` |
| `--border` | `oklch(0.274 0.006 286.033)` | `oklch(0.206 0.006 285.9)` |
| `--input` | `oklch(0.274 0.006 286.033)` | `oklch(0.206 0.006 285.9)` |
| `--secondary-accent` | `oklch(0.284 0.006 286.033)` | `oklch(0.23 0.006 286)` (hover tint, still distinct from surfaces) |
| `--sidebar` (unused today) | `oklch(0.21 0.006 285.885)` | `oklch(0.206 0.006 285.9)` (consistency) |
| `--sidebar-accent` (unused today) | `oklch(0.274 0.006 286.033)` | `oklch(0.23 0.006 286)` (consistency) |
| `--sidebar-border` (unused today) | `oklch(0.274 0.006 286.033)` | `oklch(0.206 0.006 285.9)` (consistency) |

Keys **not** changing: all `*-foreground` tokens (text stays bright — `foreground`
at `oklch(0.985 0 0)` on `#000000` has excellent contrast), `--primary`,
`--accent`, `--destructive*`, `--ring`, `--chart-*`.

Notes:
- `--secondary-accent-foreground` (`oklch(0.500 0.006 286.033)`) is used as the
  hover/selected background in dropdowns and selects (pre-existing pattern). It
  remains visible on the new darker surfaces, so it is left untouched.

### 2. Browser theme color `#161618` → `#000000` (3 spots)

- `packages/chatbot/app/layout.tsx:140` — static dark theme branch.
- `packages/chatbot/app/layout.tsx:167` — system `prefers-color-scheme: dark` branch.
- `packages/chatbot/components/theme-color-manager.tsx:10` — runtime override.

## Non-goals

- No new theme mode / no theme-toggle plumbing.
- No component refactor. The handful of hardcoded `dark:bg-zinc-900` modals
  (`#18181b`) already match the new `#17171a` surfaces almost exactly, so they
  blend with no work.
- Foreground/text and light-theme tokens are untouched.

## Testing

- `pnpm verify:fast` — lint, type-check, unit/component tests. No JSX logic
  changes; no test snapshots assert these color values (verified), so the suite
  should stay green.
- Manual checklist:
  - Chat area background renders pure black (`#000000`).
  - Cards, sidebar, popovers, inputs, modals render `#17171a`.
  - Dropdown/select hover row is still clearly visible on the dark surfaces.
  - Dark → light toggle still works; light theme unchanged.
  - Browser URL bar blends with the page in dark mode (theme-color applied).
