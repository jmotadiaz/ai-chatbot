# Superpowers Extension (First-Party)

First-party Pi extension providing the [Superpowers](https://github.com/obra/superpowers) skill suite and runtime bootstrap for the coding agent.

## Upstream Base Version

- **Repository:** `https://github.com/obra/superpowers.git`
- **Base Ref / Version:** `v6.2.0`

## Structure

```text
extensions/superpowers/
├── index.ts        # Extension entrypoint (registers ./skills via resources_discover and injects bootstrap)
├── AGENTS.md       # Upstream version info, applied modifications, and upgrade instructions
└── skills/         # All 14 Superpowers skills
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
    ├── using-superpowers/            # Upstream v6.2.0
    ├── verification-before-completion/# Upstream v6.2.0
    ├── writing-plans/                # Upstream v6.2.0
    └── writing-skills/               # Upstream v6.2.0
```

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
   - Copy the updated skills into `extensions/superpowers/skills/`.
   - Reapply the harness review flow modifications to `extensions/superpowers/skills/brainstorming/SKILL.md` (see section above).
   - Reapply the model selection modifications to `extensions/superpowers/skills/subagent-driven-development/` (see section above).
   - If upstream updated other skills or added new ones, review whether any assumptions conflict with the coding agent harness.

3. **Update Version Record:**
   - Update `Base Ref / Version` in this `AGENTS.md` file.

4. **Verify:**
   - Run the test suite:
     ```bash
     pnpm verify:fast
     ```
   - Ensure skill discovery and session manager tests pass cleanly.
