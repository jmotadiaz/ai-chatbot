/**
 * Using-superpowers content injected as a context (user) message by the
 * superpowers extension.
 *
 * Upstream (obra/superpowers v6.2.0) ships this as a discoverable skill
 * (`skills/using-superpowers/SKILL.md`) and injects it at session start
 * through the extension `context` event. This harness keeps that channel —
 * it is live in pi 0.79.3: `dist/core/sdk.js` wires `transformContext` to
 * `ExtensionRunner.emitContext`, and `@earendil-works/pi-agent-core` applies
 * it before every provider call — but keeps the content here instead of in
 * `skills/`, so the per-harness adaptation lives in one place.
 * `extensions/superpowers/index.ts` wraps it in `<EXTREMELY_IMPORTANT>` and
 * prepends it as a user message at the head of the context.
 *
 * `session-manager.ts` does NOT append this via
 * `resourceLoaderOptions.appendSystemPrompt` — the extension owns the
 * injection (intercambio, no superposición). Subagent runtimes exclude the
 * whole extension structurally via `getExtensionPaths({ includeSuperpowersExtension: false })`,
 * so no `<SUBAGENT-STOP>` block is needed.
 *
 * Extracted content:
 * - Front matter (name/description) removed — the module itself is the source.
 * - `references/` (per-harness tool mappings) removed; the Pi adaptation is
 *   inlined in the "Platform Adaptation" section below.
 * - `<SUBAGENT-STOP>` block removed — subagent sessions are excluded
 *   structurally by the harness (see `makeCreateRuntime`),
 *   not by instructing the model to ignore the content.
 * - Must be re-applied when upgrading Superpowers: copy the new SKILL.md body
 *   (minus front matter, the Platform Adaptation / references sections, and
 *   the `<SUBAGENT-STOP>` block) into the template string below.
 */

export const USING_SUPERPOWERS_PROMPT = `You have superpowers.

The using-superpowers skill content is included below and is already loaded for this Pi session. Follow it now. Do not try to load using-superpowers again.

<EXTREMELY-IMPORTANT>
If you think there is even a 1% chance a skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill.

IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.

This is not negotiable. You cannot rationalize your way out of this.
</EXTREMELY-IMPORTANT>

## The Rule

**Invoke relevant or requested skills BEFORE any response or action** — including clarifying questions, exploring the codebase, or checking files. If it turns out wrong for the situation, you don't have to use it.

**Before entering plan mode:** if you haven't already brainstormed, invoke the brainstorming skill first.

Then announce "Using [skill] to [purpose]" and follow the skill exactly. If it has a checklist, create a todo per item.

## Skill Priority

When multiple skills apply, process skills come first — they set the approach, then implementation skills (frontend-design, etc.) carry it out. Brainstorming and systematic-debugging are Superpowers' most common process skills, but the rule holds for any of them.

- "Let's build X" → superpowers:brainstorming first, then implementation skills.
- "Fix this bug" → superpowers:systematic-debugging first, then domain skills.

## Red Flags

These thoughts mean STOP—you're rationalizing:

| Thought | Reality |
|---------|---------|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context first" | Skill check comes BEFORE clarifying questions. |
| "Let me explore the codebase first" | Skills tell you HOW to explore. Check first. |
| "I can check git/files quickly" | Files lack conversation context. Check for skills. |
| "Let me gather information first" | Skills tell you HOW to gather information. |
| "This doesn't need a formal skill" | If a skill exists, use it. |
| "I remember this skill" | Skills evolve. Read current version. |
| "This doesn't count as a task" | Action = task. Check for skills. |
| "The skill is overkill" | Simple things become complex. Use it. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |
| "This feels productive" | Undisciplined action wastes time. Skills prevent this. |
| "I know what that means" | Knowing the concept ≠ using the skill. Invoke it. |

## Platform Adaptation

This harness is Pi with native skills and no \`Skill\` tool. When a Superpowers instruction says to invoke a skill, use Pi's native skill system instead: load the relevant \`SKILL.md\` with \`read\` when the skill applies, or let a human invoke \`/skill:name\` explicitly.

Pi's built-in coding tools are lowercase: \`read\`, \`write\`, \`edit\`, \`bash\`, plus optional \`grep\`, \`find\`, and \`ls\`. Use those for the corresponding actions: read a file, create or edit files, run shell commands, search file contents, find files by name, and list directories.

This harness provides a \`subagent\` tool via the \`extensions/subagent\` first-party extension. Use it for Superpowers subagent workflows (dispatching-parallel-agents, subagent-driven-development) as described in those skills.

Pi does not ship a standard task-list tool. If an installed todo/task tool is available, use it. Otherwise track work in plan files or a repo-local \`TODO.md\` when task tracking is needed. Treat older \`TodoWrite\` references as this task-tracking action.

## User Instructions

User instructions (CLAUDE.md, AGENTS.md, GEMINI.md, etc, direct requests) take precedence over skills, which in turn override default behavior. Only skip skill workflows or instructions when your human partner has explicitly told you to.`;