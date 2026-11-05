# UI Prototype

Generate **several radically different UI variations** inside a single self-contained HTML artifact, switchable from a **floating bottom bar**. The user opens the artifact link in the Chatbot, flips between variants in the browser, picks one (or combines parts from each), and then you fold the winning design into the real components.

If the question is about state transitions or business logic rather than what something should look like and how its controls feel, use [LOGIC.md](LOGIC.md).

## When this is the right shape

- "What should this page or component look like?"
- "Create 3 redesign prototypes for how tool calls are presented in the chat."
- "I want to see a few layout options for this panel before committing."
- Any time the user would otherwise spend hours choosing between vague descriptions in prose.

## Two sub-shapes: project UI context vs. prototype from scratch

Decide first whether the prototype is anchored in the current project's interface or built from scratch:

### Sub-shape A: Prototype based on the current project's interface (emulate project context)

When the prototype is based on the UI of the project being worked on (redesigning an existing component, adjusting an existing screen, or adding a section that lives inside one), the prototype **must emulate the context of that project**:
- Inspect the target component, its surrounding host screen/layout, and the project's theme tokens (e.g. `globals.css` colour variables, typography, and spacing).
- Render the surrounding interface context (layout chrome, neighbouring elements, realistic data, and real visual density) around the variants so the user judges each option butting up against a faithful emulation of the project's real UI rather than floating in a vacuum.

### Sub-shape B: Prototype from scratch (rule excluded)

When the prototype is built from scratch (a greenfield UI or standalone concept not based on the current project's interface), **the project-context emulation rule does not apply**:
- Do not inspect or copy the current project's UI components, layout chrome, or stylesheets.
- Frame a clean, self-contained viewport tailored directly to the prototype's own premise.

## Process

### 1. State the question and pick N

Default to **3 variants** (cap at 5; more than 5 stops being radically different and turns into noise).

Include a compact header or intro strip at the top of the artifact stating the design question and the one-line thesis of each variant:
> *"Three structural variants for coding-agent tool presentation in chat: A (Compact Timeline Rail), B (Bento Status Cards), C (Inline Narrative + Drawer Inspector)."*

### 2. Design radically different variants

Each variant (`A`, `B`, `C`) must disagree about **structure**:
- Different layout and spatial footprint (e.g. vertical rail vs. card grid vs. split inspector).
- Different information hierarchy and progressive disclosure (what is visible collapsed vs. expanded).
- Different primary affordance.

Three slightly tweaked card grids or colour swaps is wallpaper, not a UI prototype. If two variants feel too similar, replace one with a deliberately contrasting layout model.

Populate every variant with **realistic states** that exercise the design's edges (e.g. a tool currently running/streaming, a completed tool with rich output, a failed tool with an error trace, and collapsed vs. expanded states) and wire interactive toggles (`<details>`, expandable drawers, state filter pills, or a light/dark preview toggle) so the user can explore the states directly.

### 3. Build a single self-contained HTML file

Write **one file** directly to `/tmp/prototype-<slug>.html`:
- Use **Tailwind via CDN** (`https://cdn.tailwindcss.com`) and inline `<style>` / `<script>`.
- **Never write generator scripts (`build.py`) or split `.css`/`.js` files.** The artifact route only serves `index.html`.
- Keep all variant templates or render functions inside that single file, switching the active variant container cleanly via JS:
  ```js
  function selectVariant(id) {
    document.querySelectorAll('[data-variant]').forEach((el) => {
      el.hidden = el.dataset.variant !== id;
    });
    // update active pill in the floating switcher and location.hash
    window.location.hash = `variant=${id}`;
  }
  ```
- **Opaque-origin sandbox safety:** Because the artifact runs inside `<iframe sandbox="allow-scripts allow-downloads allow-popups">` (without `allow-same-origin`), use in-memory state and `window.location.hash` (`#variant=B`). Never call `localStorage`, `sessionStorage`, `document.cookie`, or `history.pushState`/`replaceState` (all throw `SecurityError`).

### 4. Build the floating switcher

Render a fixed-position bar at the bottom-center of the viewport (`fixed bottom-4 left-1/2 -translate-x-1/2 z-50`) with three pieces:

- **Left arrow (`←`)**: cycles to the previous variant (wraps around).
- **Variant selector pills / label**: shows each variant key and short name (e.g. `A · Rail`, `B · Cards`, `C · Narrative`) so the user sees where they are and can jump directly or cycle.
- **Right arrow (`→`)**: cycles forward (wraps around).

Behaviour and styling:
- **Keyboard navigation**: `ArrowLeft` and `ArrowRight` cycle variants. Ignore key events when focus is inside an `<input>`, `<textarea>`, `<select>`, or `[contenteditable]` element.
- **Touch & mobile**: keep buttons at `min-h-[44px]` and let the bar fit within 320px viewports (`max-w-[calc(100vw-1.5rem)] overflow-x-auto`). Add `pb-24` to the page body so the floating bar never obscures the bottom of a variant.
- **Visually distinct**: style the bar as a high-contrast floating pill with shadow and backdrop blur so it is unmistakably prototype switcher chrome, not part of the UI being evaluated.

### 5. Verify mobile-first and publish

1. Follow `mobile-first-artifacts` (viewport meta tag, `grid-cols-1` base layouts expanding at `sm:`/`md:`/`lg:`, base font `≥ 12px`, `min-w-0` on flex/grid children, self-scrolling code/table containers).
2. Run the CLI mobile check on the local file before publishing:
   ```bash
   pnpm --filter chatbot check:mobile "/tmp/prototype-<slug>.html"
   ```
   Fix any reported overflow or sub-12px text nodes in `/tmp/prototype-<slug>.html` and re-run `check:mobile` until it exits 0.
3. **Do not run browser screenshot-read loops.** Rely on `check:mobile` instead of launching `agent-browser` to screenshot and `read` PNGs into context.
4. Call `publish_artifact({ path: "/tmp/prototype-<slug>.html", name: "prototype-<slug>" })` and present the returned path in your reply **strictly as a Markdown link**:
   ```markdown
   [Ver prototipo: <Título descriptivo>](/agent/code/<project>/<sessionId>/artifacts/prototype-<slug>)
   ```
   Do **not** output the path as plain text, bold text, or in a code block (`...`), because the chat markdown parser does not autolink relative URLs — only `[Label](path)` syntax is converted into a clickable artifact link. Include a brief summary of the trade-offs of each variant.

### 6. Capture the answer and fold into real code

The user will flip through the variants and reply with their choice — often a hybrid (*"I want the timeline rail from A with the error summary badge from B"*). Once they decide, implement the winning design in the real React/Next.js components with proper types and tests.

## Anti-patterns

- **Variants that differ only in colour, border radius, or copy.** That is a tweak, not a prototype. Real variants disagree about structure and information hierarchy.
- **Evaluating an in-project UI change in an empty box (or forcing project chrome onto a from-scratch prototype).** When the prototype is based on the current project's interface, emulate its surrounding UI context; when it is a prototype from scratch, skip project context emulation entirely.
- **Writing Python/Node scripts (`build.py`) to generate HTML.** Author the single `/tmp/prototype-<slug>.html` file directly.
- **Screenshot-and-read loops with `agent-browser`.** Reading 20+ PNGs into the LLM context destroys latency and token budgets. Use `pnpm --filter chatbot check:mobile` for layout verification.
- **Printing raw URLs or code blocks instead of Markdown links.** Emitting `/agent/code/...` as raw text or in a code block leaves the user without a clickable link. Always emit `[Label](path)`.
