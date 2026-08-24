# Superpowers Extension (First-Party)

First-party Pi extension providing the [Superpowers](https://github.com/obra/superpowers) skill suite and the using-superpowers bootstrap for the coding agent.

## Upstream Base Version

- **Repository:** `https://github.com/obra/superpowers.git`
- **Base Ref / Version:** `v6.2.0`

## Structure

```text
extensions/superpowers/
├── index.ts               # Extension entrypoint (registers ./skills via resources_discover)
├── using-superpowers.ts   # Bootstrap injected as a context (user) message (see below) [MODIFIED]
├── AGENTS.md              # Upstream version info, applied modifications, and upgrade instructions
└── skills/                # 13 Superpowers skills (using-superpowers extracted from here)
    ├── brainstorming/                # [MODIFIED] Customized for harness file browser review flow
    ├── dispatching-parallel-agents/  # Upstream v6.2.0
    ├── executing-plans/              # Upstream v6.2.0
    ├── finishing-a-development-branch/# Upstream v6.2.0
    ├── receiving-code-review/        # Upstream v6.2.0
    ├── requesting-code-review/       # Upstream v6.2.0
    ├── subagent-driven-development/  # [MODIFIED] Model parameter omitted by default, only declared when requested by user
    ├── systematic-debugging/         # Upstream v6.2.0
    ├── test-driven-development/      # Upstream v6.2.0
    ├── using-git-worktrees/          # Upstream v6.2.0
    ├── verification-before-completion/# Upstream v6.2.0
    ├── writing-plans/                # Upstream v6.2.0
    └── writing-skills/               # Upstream v6.2.0
```

### `using-superpowers.ts` (Bootstrap, not a skill)

Upstream ships `using-superpowers` as a skill and injects it at session start
through the extension `context` event (user-message prepend). This harness
keeps that channel — it is live in pi 0.79.3: `dist/core/sdk.js` wires
`transformContext` to `ExtensionRunner.emitContext`, and
`@earendil-works/pi-agent-core` applies it in `streamAssistantResponse` before
every provider call — but keeps the content in `using-superpowers.ts` instead
of in `skills/`, so the harness adaptation lives in one place.
Intercambio, no superposición: `src/session-manager.ts` does NOT append the
bootstrap via `resourceLoaderOptions.appendSystemPrompt` (only
`FILE_REFERENCE_PROMPT` stays there); the extension owns the injection.

1. The skill was extracted from `skills/` (its `references/` per-harness tool
   mappings were deleted; the Pi tool mapping is inlined in the content).
2. `extensions/superpowers/index.ts` wraps `USING_SUPERPOWERS_PROMPT` in
   `<EXTREMELY_IMPORTANT>` plus an identifying line and prepends it as a
   `user` message at the head of the context, after any `compactionSummary`
   messages. The transform runs on a clone of the message list, so the
   bootstrap never reaches `session.messages`, the session file, or the UI
   transcript. Nothing branches on that line — the prepend is unconditional,
   and the harness only uses it to locate the message in a payload
   (`bootstrapMarkerIndex`). Upstream guards the injection with an "already
   present?" check; it cannot work here (the transformed copy is discarded
   after each request, so a previous injection is undetectable) and it fires
   on any tool result quoting the marker, such as a `read` of the extension's
   own source.
3. Cadence is harness-owned and **diverges from upstream**. Upstream arms the
   injection on `session_start`/`session_compact` and disarms it on
   `agent_end`, so only the first turn of a session carries the bootstrap;
   from turn two on it depends on the model deciding to load the
   `using-superpowers` skill from the catalogue on its own. Here that is not
   left to the model: the bootstrap is injected on every LLM call, and the
   skill stays out of `skills/`. At the head of the context it also forms a
   stable cache prefix, since the conversation grows after it.
4. Subagent runtimes exclude the superpowers extension **entirely** (bootstrap
   AND the 13 skills): `makeCreateRuntime` passes
   `includeSuperpowersExtension: false` alongside
   `includeSubagentExtension: false` (the flag that also strips the `subagent`
   tool from child sessions). A subagent executes one specific task from a
   self-contained brief (see the upstream subagent-driven-development prompts,
   which never reference skills); skill workflows belong to the orchestrating
   agent alone. The content therefore carries no `<SUBAGENT-STOP>` block — the
   harness does not load it for subagents, instead of loading it and telling
   the model to ignore it.
5. Because the content is injected via the extension (not the resource loader),
   the skill is not discoverable and `resources_discover` never lists it.

## Modifications Applied to Upstream Skills

### `skills/brainstorming/`

Upstream Superpowers presents design sections incrementally in the chat session and commits the final design doc immediately upon drafting. In our harness, this flow was modified to use the built-in file browser as the primary review surface:

1. **Uncommitted Spec Draft:** The design is written directly to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` as an uncommitted file. The agent tells the user to review the file in the file browser.
2. **Line Comment Review:** The user attaches comments directly on lines/blocks in the file browser (delivered in chat as `"Code review comments:"` blocks).
3. **Iterative Editing:** The agent addresses each comment by modifying the uncommitted spec file and summarizing changes in chat.
4. **Commit Gate:** The spec document is only committed to git once the user gives explicit approval. Only after committing does the agent invoke `writing-plans`.

#### Key Diff in `brainstorming/SKILL.md`:
```diff
- 5. **Present design** — in sections scaled to their complexity, get user approval after each section
- 6. **Write design doc** — save to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commit
+ 5. **Write the design as an uncommitted file** — save to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` without committing. DO NOT present design content in chat. The user reviews the file through the harness file browser by adding line comments on specific blocks. Chat stays for clarifying questions, summarising changes, and signalling approval (see The Process below).
+ 6. **Iterate on comments** — when the user sends "Code review comments:" blocks referencing the spec, address every comment by editing the file. Summarise changes in chat. Repeat until the user approves.
- 8. **User reviews written spec** — ask user to review the spec file before proceeding
- 9. **Transition to implementation** — invoke writing-plans skill to create implementation plan
+ 8. **Commit and transition** — once the user approves, commit the spec, then invoke writing-plans skill to create the implementation plan.
```

### `skills/subagent-driven-development/`

Upstream Superpowers prescribes model-tiering heuristics (cheap/fast for mechanical tasks, standard for integration, capable for architecture/reviews) and mandates explicit model declarations on every subagent dispatch. In our harness, subagents inherit the session default model unless explicitly overridden by the user:

1. **Omit Model Parameter by Default:** When invoking the `subagent` tool, leave `model` empty or omitted. The subagent inherits the parent session's active model.
2. **User-Driven Model Selection Only:** Declare the `model` parameter if and only if the user explicitly requested a specific model for the subagents or for a particular role/task.
3. **Template Alignment:** Prompt templates (`implementer-prompt.md`, `task-reviewer-prompt.md`, `re-review-prompt.md`) and flowcharts are adjusted so `model` is optional and omitted by default.

#### Key Diff in `subagent-driven-development/SKILL.md`:
```diff
- ## Model Selection
- 
- Use the least powerful model that can handle each role to conserve cost and increase speed.
- ...
- **Always specify the model explicitly when dispatching a subagent.** An
- omitted model inherits your session's model — often the most capable and
- most expensive — which silently defeats this section.
+ ## Model Selection
+ 
+ **Do not specify a model unless explicitly requested by the user.**
+ 
+ By default, when dispatching a subagent with the `subagent` tool, leave the `model` parameter empty (omitted or empty string `""`). An omitted or empty `model` inherits the session's current model.
+ 
+ **Only specify `model` if the user explicitly requests it:**
+ - If the user explicitly requests a specific model for the task, subagents, or a specific role (e.g. "use model X for subagents" or "run the reviewer with model Y"), pass that exact model in the `model` parameter.
+ - In all other cases, leave `model` empty / omitted.
```

#### Key Diff in `subagent-driven-development/implementer-prompt.md`:
```diff
-  model: [MODEL — REQUIRED: choose per SKILL.md Model Selection; an omitted
-         model silently inherits the session's most expensive one]
+  model: [MODEL — only specify if explicitly requested by user; otherwise leave empty/omitted]
```

#### Key Diff in `subagent-driven-development/task-reviewer-prompt.md`:
```diff
-  model: [MODEL — REQUIRED: choose per SKILL.md Model Selection; an omitted
-         model silently inherits the session's most expensive one]
+  model: [MODEL — only specify if explicitly requested by user; otherwise leave empty/omitted]
...
- - `[MODEL]` — REQUIRED: reviewer model per SKILL.md Model Selection
+ - `[MODEL]` — only specify if explicitly requested by user; otherwise leave empty/omitted
```

#### Key Diff in `subagent-driven-development/re-review-prompt.md`:
```diff
-  model: [MODEL — REQUIRED: choose per SKILL.md Model Selection; an omitted
-         model silently inherits the session's most expensive one]
+  model: [MODEL — only specify if explicitly requested by user; otherwise leave empty/omitted]
...
- - `[MODEL]` — REQUIRED: reviewer model per SKILL.md Model Selection; scoped
-   re-reviews of small fix diffs take a cheap-to-mid tier
+ - `[MODEL]` — only specify if explicitly requested by user; otherwise leave empty/omitted
```

## Upstream Upgrade Guide

When upgrading Superpowers to a newer upstream release, follow these steps:

1. **Inspect Upstream Changes:**
   - Clone or fetch the new upstream tag/branch from `https://github.com/obra/superpowers.git`.
   - Check the release notes and diff between the current base version and the new version.

2. **Update Skills:**
   - Copy the updated skills into `extensions/superpowers/skills/`. Do NOT copy `using-superpowers/` (it is not a discoverable skill in this harness).
   - Reapply the harness review flow modifications to `extensions/superpowers/skills/brainstorming/SKILL.md` (see section above).
   - Reapply the model selection modifications to `extensions/superpowers/skills/subagent-driven-development/` (see section above).
   - Update the embedded bootstrap in `using-superpowers.ts`: copy the new upstream `skills/using-superpowers/SKILL.md` body (minus front matter, minus the `## Platform Adaptation` section and its `references/`, minus the `<SUBAGENT-STOP>` block — subagents are excluded structurally by `makeCreateRuntime` via `includeSuperpowersExtension: false`) into the template string, keeping the "You have superpowers. …" preamble, the pi tool mapping in `## Platform Adaptation`, and the `\` escaping for inline code. The injection point stays `pi.on("context")` in `extensions/superpowers/index.ts` (user-message prepend, as upstream), not `resourceLoaderOptions.appendSystemPrompt`.

3. **Update Version Record:**
   - Update `Base Ref / Version` in this `AGENTS.md` file.

4. **Verify:**
   - Run the test suite:
     ```bash
     pnpm verify:fast
     ```
   - Ensure skill discovery and session manager tests pass cleanly.
