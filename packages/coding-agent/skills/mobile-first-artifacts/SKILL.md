---
name: mobile-first-artifacts
description: Use when writing any HTML/markdown artifact the user reads in a browser (architecture review, canvas, report, lesson, diagram page) — author it mobile-first and verify it before publish_artifact
---

# Mobile-First Artifacts

## Overview

Every artifact this harness produces is served over `GET /artifacts/` and opened
wherever the user happens to be — including a phone. Generated reports fail
there quietly: Tailwind classes without a breakpoint prefix look perfect at
1440px and break below 640px, and nothing in the source hints at it.

Measured on a real architecture review, before these rules were written:

```
320px: desborda 134px · 296 nodos de texto < 12px (mín 6.8px)
390px: desborda 64px
  ↳ <div class="lg:col-span-3 … p-4">  mide 397px   ← la rejilla padre usa grid-cols-3 sin prefijo
  ↳ <table class="w-full text-[12px]"> mide 363px   ← sin contenedor con scroll propio
```

Two decisions carry the fix: the **base layout is one column** (breakpoints *add*
structure, never remove it), and **nothing wider than the viewport is ever placed
in normal flow** (wide content gets its own scroll container instead).

## When to Use

- Writing a report/review/canvas in HTML, including the `HTML-REPORT.md` scaffold
  from `improve-codebase-architecture` and anything `teach`, `prototype` or
  `wayfinder` render as a page.
- Editing an artifact that already exists.
- Before calling `publish_artifact`: it is the last gate.

### When NOT to Use

Markdown that is read inside the chat UI, and JSON/CSV data files: no layout is
yours to control there.

## Hard Rules

1. **Viewport meta always**, right after `<meta charset>`:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1" />
   ```
2. **One column by default.** Write `grid-cols-1` and add columns at
   `sm:`/`lg:`. A bare `grid-cols-2|3|4` is the single most common cause of a
   sideways-scrolling report.
   ```html
   <!-- mal: 3 columnas de ~104px en un móvil -->
   <div class="grid grid-cols-3 gap-4">
   <!-- bien -->
   <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
   ```
3. **Before/after pairs stack.** They are the payload of every candidate card:
   `grid-cols-1 md:grid-cols-2`, never side by side from 0px.
4. **Type floor 12px at the base size.** Keep the base at `≥`12px and only shrink
   to 11px from `sm:` upward, e.g. `text-xs sm:text-[11px]` (12px on a phone,
   11px on a desktop where it is legible). `text-[9px]`/`text-[10px]` as the base
   is unreadable on a phone and is what the checker reports as `nodos < 12px`.
5. **Wide content scrolls itself, not the page.** Wrap tables, code blocks and
   diagrams:
   ```html
   <div class="overflow-x-auto -mx-4 px-4">
     <table class="w-full min-w-[520px]">…</table>
   </div>
   ```
6. **No fixed pixel widths** (`w-[900px]`, `min-w-[900px]`) on flow content; use
   `w-full max-w-6xl` plus `px-4` gutters (`max-w-6xl mx-auto px-4 sm:px-6`).
7. **`min-w-0` on grid/flex children** that hold long code, paths or file names,
   so they truncate instead of pushing their parent past the viewport.
8. **SVGs scale**: `viewBox` + `class="w-full h-auto"`. Never `width="1200"` as a
   presentational attribute — it pins the intrinsic size and overflows.
9. **Mermaid stays inside the column**: `initialize({ …, useMaxWidth: true })`, and
   prefer vertical graphs (`flowchart TB`) over `LR`; a graph wider than ~5 nodes
   should be split or rotated rather than shrunk.
10. **Tap targets ≥ 44px** for anything the user selects (candidate cards, links
    in a grilling loop). `p-4`/`py-3` on the clickable element, not `p-1`.
11. **Keep the pinned CDNs** (`cdn.tailwindcss.com`, `cdn.jsdelivr.net`): the
    viewer's CSP allowlists exactly those hosts. Another CDN or an inline
    `<link>` stylesheet renders the report broken — see `HTML-REPORT.md`.

## Verify Before Publishing

The check is not optional and not a judgment call:

```bash
pnpm --filter chatbot check:mobile "<url absoluta del artifact>"
```

It opens the page at 320px and 390px, reports horizontal overflow, the elements
causing it, and the count of sub-12px text nodes. Exit 0 = publishable.

The URL has to come from `publish_artifact` first, so the loop is: **write →
publica → comprueba → arregla → vuelve a publicar**. Republishing the same name
with changed content yields a new hashed URL (the old version is kept, not
clobbered), so nothing is lost by iterating.

If a fix genuinely cannot fit 320px (a wide dependency graph the user asked for),
say so in the message that carries the URL rather than passing the check off as
green — the escape valve is a rule you can see being broken, not one that is
silently dropped.

## Common Mistakes

- **"It has a viewport tag, so it's responsive."** The tag enables the viewport;
  it does not create one column out of `grid-cols-3`.
- **Debugging at desktop width with DevTools zoom.** Zoom is not a narrow
  viewport: media queries and `container` units keep firing at desktop sizes.
- **Wrapping the whole `<body>` in `overflow-x-auto`** to make the checker pass.
  That hides the symptom and breaks `position: sticky` headers; contain the wide
  element instead (rule 5).
- **Only checking 390px.** 320px is where the tightest card grids break, and it
  is still very common.
- **Rechecking with a cached page.** The viewer sends `no-store`, but a
  long-lived browser tab may still show an old artifact: use the new URL that
  `publish_artifact` returns after each fix.
