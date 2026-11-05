# Logic Prototype

A single, self-contained HTML artifact (a **shareable demo**) that lets anyone drive a state model by clicking buttons. Use this when the question is about **business logic, state transitions, or data shape**: the kind of thing that looks reasonable on paper but only feels wrong once you push it through real cases.

Because it is published as a single HTML artifact with nothing to install, the user opens the returned Chatbot URL in their browser and feels the model for themselves. It speaks domain language, not code.

## When this is the right shape

- "I'm not sure if this state machine handles the edge case where X then Y."
- "Does this data model actually let me represent the case where..."
- "I want to feel out what the API or queue behaviour should look like before writing it."
- Anything where someone wants to **press buttons and watch state change**.

If the question is "what should this look like," this is the wrong branch. Use [UI.md](UI.md).

## Process

### 1. State the question

Before writing code, write down what state model and what question you are prototyping: one paragraph at the top of the demo (in a visible intro banner, not just a comment). A logic prototype that answers the wrong question is pure waste, so make the question explicit in the page header.

### 2. Isolate the logic in a portable module

Put the actual logic (the part that answers the question) in a single `<script>` block written as a small, pure module that can be lifted out and dropped into the real codebase later. The page around it is throwaway; this module isn't.

Pick the shape that best fits the question being asked, not whichever is easiest to wire to a page:

- **A pure reducer**: `(state, action) => state`. Good when actions are discrete events and state is a single value.
- **A state machine**: explicit states, legal transitions, and guard reasons when an action is disallowed. Good when "which actions are even legal right now" is part of the question.
- **A small set of pure functions** over a plain data type. Good when there is no implicit current state, just transformations.
- **A class or module with a clear method surface** when the logic genuinely owns ongoing internal state.

Keep the logic module pure: no DOM, no `document`, no button handlers reaching inside it. The page calls into it; nothing flows the other direction. Once the question is answered, the validated reducer / machine / function set lifts straight into the real module.

### 3. Build the self-contained HTML file

Write one file at `/tmp/prototype-<slug>.html` using Tailwind via CDN (`https://cdn.tailwindcss.com`) and inline `<script>` / `<style>`. Author it mobile-first per the `mobile-first-artifacts` skill.

Write every label in **domain language**, not code: buttons and state read like the business, not the reducer.

Lay it out with a clean hierarchy, top to bottom:

1. **Title and one-line explanation** of what this demo lets you explore (the question from step 1).
2. **Current state**: the full relevant state, rendered as a readable panel (labelled fields and badges, not a raw JSON dump), re-rendered after every click so the change is visible. Call out what just changed (or why an action was rejected).
3. **Free-play buttons**: one button per action (`min-h-[44px]` tap targets), always visible so anyone can poke at the model in any order. Each click dispatches its action and re-renders the state.
4. **Guided walkthroughs**: a set of **scenarios**, one per tab. Each tab holds a short plain-language description of the scenario (the situation it sets up and what to watch for) and underneath it, the ordered **buttons to press** for that scenario. Each step is a real button: clicking it performs that action and advances to the next step. Starting a walkthrough resets to a known initial state so the scenario runs deterministically every time.

Choose scenarios that demonstrate the awkward cases that are hard to reason about on paper: the happy path, a tricky race or ordering edge case, and an attempt at an illegal transition.

Keep the visual style restrained: clean typography, generous spacing, one accent colour. Nothing should compete with the state panel and the action buttons.

### 4. Verify and publish

1. Run the mobile-first gate on the local file:
   ```bash
   pnpm --filter chatbot check:mobile "/tmp/prototype-<slug>.html"
   ```
   Fix any horizontal overflow or sub-12px text reported by the CLI.
2. Publish the artifact with `publish_artifact({ path: "/tmp/prototype-<slug>.html", name: "prototype-<slug>" })` and present the returned Chatbot view path in your reply **strictly as a Markdown link**:
   ```markdown
   [Ver demo de lógica: <Título descriptivo>](/agent/code/<project>/<sessionId>/artifacts/prototype-<slug>)
   ```
   Do not output raw paths or code blocks — relative URLs are not autolinked unless written in Markdown link syntax `[Label](path)`.

### 5. Capture the answer

Once the user clicks through the walkthroughs and free-play buttons, their reactions (*"wait, that shouldn't be possible"* or *"I assumed X would reset Y"*) reveal the bugs in the idea. Iterate in place by editing `/tmp/prototype-<slug>.html` and calling `publish_artifact` with the same `name`. When the model is validated, lift the pure logic module into the real codebase (or inline the decision-rich state shape into the spec/ticket).

## Anti-patterns

- **Don't add tests.** A prototype that needs tests is no longer a prototype.
- **Don't wire it to a database or storage APIs.** Keep state in memory (remember: `localStorage` and `sessionStorage` throw `SecurityError` inside the artifact viewer's sandboxed iframe).
- **Don't generalise.** No "what if we wanted to support X later." The prototype answers one question.
- **Don't blur the logic and the page together.** If the pure module references `document` or DOM nodes, it is no longer liftable.
- **Don't reach for a framework, bundler, or generator script.** Write the single HTML file directly.
- **Don't output raw paths or code blocks for the URL.** Always wrap the artifact path in a Markdown link `[Label](path)` so the Chatbot renders it as a clickable link.
- **Don't ship the HTML shell into production.** The page is optimised for clicking through by hand; the pure logic module behind it is the part worth keeping.
