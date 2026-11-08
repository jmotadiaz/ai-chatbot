---
name: prototype
description: Build a throwaway HTML prototype and publish it with publish_artifact to answer a design question. Use when the user wants to explore what a UI or component redesign should look like across multiple variations, or sanity-check whether a state model or business logic feels right.
---

# Prototype

A prototype is **throwaway code that answers a design question**. The question decides the shape.

## Pick a branch

Identify which question is being answered from the user's prompt, the surrounding code, or by asking if the user is around:

- **"Does this logic / state model feel right?"** → [LOGIC.md](LOGIC.md). Build a single self-contained HTML artifact (free-play action buttons plus tabbed guided walkthroughs) that pushes the state machine through cases that are hard to reason about on paper, and that a non-developer can drive.
- **"What should this look like?"** → [UI.md](UI.md). Build a single self-contained HTML artifact containing several radically different UI variations, switchable via a collapsible floating dock and keyboard arrows.

The two branches produce very different artifacts, so getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding subject (a state machine, reducer, or backend module → [LOGIC.md](LOGIC.md); a page, chat view, or component → [UI.md](UI.md)) and state the assumption at the top of the prototype.

## Rules that apply to both

1. **One self-contained HTML file in `/tmp`, published via `publish_artifact`.**
   - Resolve the OS temp directory (`$TMPDIR` or `/tmp`) and write directly to `/tmp/prototype-<slug>.html` so nothing lands in the repository or `.scratch/`.
   - Inline all `<style>` and `<script>` inside that single file. The Chatbot artifact route (`/api/agent/code/<project>/artifacts/<name>`) serves **only** `index.html` — external local `.css` or `.js` files and multi-file build scripts (`build.py`) will 404.
   - Author the HTML directly; do not write Python or Node generator scripts to assemble it.
2. **Respect the artifact viewer's sandbox and CSP.**
   - **Allowed CDNs:** The viewer's Content-Security-Policy allows scripts, styles, fonts, and images only from `https://cdn.tailwindcss.com`, `https://cdn.jsdelivr.net`, and `https://unpkg.com` (plus inline scripts/styles and `data:`/`blob:` URLs).
   - **Opaque-origin iframe:** The Chatbot renders the artifact inside `<iframe sandbox="allow-scripts allow-downloads allow-popups">` (without `allow-same-origin`). Keep all state in memory and, when deep-linking is useful, in `location.hash` (e.g. `#variant=B`). Never access `localStorage`, `sessionStorage`, `document.cookie`, or `history.pushState`/`replaceState` — all throw `SecurityError` in an opaque origin.
3. **Mobile-first, verified once by CLI — no screenshot loops.**
   - Follow the `mobile-first-artifacts` skill (viewport meta tag, single-column base layout `grid-cols-1`, base font size `≥ 12px`, `≥ 44px` tap targets, self-scrolling wide containers).
   - Validate the local file before publishing:
     ```bash
     pnpm --filter chatbot check:mobile "/tmp/prototype-<slug>.html"
     ```
   - Rely on `check:mobile`'s deterministic text output. Do **not** run iterative `agent-browser` screenshot → `read` `.png` loops (reading screenshots into context burns massive vision tokens and latency).
4. **Prototype chrome collapses. Never leave a permanent bar on screen.**
   Chrome splits by position and both halves collapse:
   - **Floating, bottom:** one dock holding the variant switcher and nothing else, collapsed to a
     `≥44px` handle that shows the active key.
   - **In flow, top:** the sub-variation panel (turn states, scenarios, open/close-all, theme) as a
     collapsed row that summarises the current state (`3 · Paralelo`) behind a chevron. It scrolls
     away with the page — never `sticky`, never `fixed`, never pinned into the emulated header.
   Collapsed is the default below `sm`; `Escape` collapses whatever is open, `h` toggles the dock,
   `e` toggles the state panel. On a 320px phone a bar that can never be dismissed eats a third of
   the viewport and hides the very thing being judged.
   Shape and behaviour: [UI.md §4](UI.md#4-build-the-control-chrome-two-collapsible-halves).

5. **Publish with a stable `name` and present it as a Markdown link `[Label](<path>)`.**
   - Call `publish_artifact({ path: "/tmp/prototype-<slug>.html", name: "prototype-<slug>" })`.
   - **Crucial link rendering rule:** In your reply to the user, you **must format the returned path as a standard Markdown link**:
     ```markdown
     [Ver prototipo: <Título descriptivo>](/agent/code/<project>/<sessionId>/artifacts/prototype-<slug>)
     ```
   - **Never** output the path as plain text, bold text (`**/agent/code/...**`), or inside backticks / code blocks (`` `/agent/code/...` ``). Relative paths are **not autolinked** by the markdown parser; only an explicit Markdown link syntax (`[Label](path)`) produces an HTML `<a>` anchor that the Chatbot intercepts to render a clickable link that opens the artifact viewer.
   - Republishing with the same `name` overwrites `<name>/index.html` in place while keeping the URL stable across iterations.
   - Never run `xdg-open`, `open`, or `start` — this agent runs headless.
6. **Emulate the project's UI context when based on the current project's interface (skip for from-scratch prototypes).**
   - **Applicable case — prototype based on the current project's UI:** When redesigning or extending a screen, view, or component of the project being worked on, inspect its stylesheets/tokens and surrounding components, and emulate the project's interface context (surrounding layout/chrome, colour palette, typography, spacing density, and realistic neighbouring content) so the prototype is judged inside a faithful representation of the real interface.
   - **Excluded case — prototype from scratch:** When the request is a greenfield prototype from scratch (not based on the current project's interface), this rule does not apply — do not inspect the project's UI files or force the project's visual context onto it.
7. **Skip the polish and surface the state.**
   - No tests, no persistence, no abstractions beyond what makes the prototype runnable and clear.
   - After every action (logic) or on every variant switch (UI), render the relevant state and interactive controls clearly so the user can feel the behaviour first-hand.
8. **Capture the answer when done.**
   - Once the user validates a state model or picks a UI variant (or a hybrid of variants), fold the validated decision into the real codebase, spec, or implementation ticket.
