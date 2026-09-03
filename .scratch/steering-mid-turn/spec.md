# Spec: Steering mid-turn en dos fases

**Status:** ready-for-agent

## Problem Statement

Cuando el Coding Agent está en mitad de un Turn, no hay forma de darle una instrucción sin esperar a que termine o abortar el trabajo en curso. Abortar pierde el progreso y esperar hace llegar la corrección tarde, cuando el agente ya tomó decisiones caras con una dirección equivocada.

## Solution

Un flujo en dos fases con un único Mensaje en Espera de texto plano: en Turn activo, un botón followUp dedicado encola la instrucción y la muestra como chip sobre el textarea; el chip permite editar (devuelve el texto al textarea), eliminar (descarta) o enviar (promociona a Steering para inyectarlo en el siguiente request del Turn activo, sin abortar las tools en curso y sin ejecutarlo dos veces).

## User Stories

1. As a coding session driver, I want to enqueue a plain-text instruction mid-Turn, so that the agent picks it up without me aborting its current tool calls.
2. As a coding session driver, I want to see my enqueued instruction as a chip above the textarea, so that I know it is armed and pending.
3. As a coding session driver, I want to edit the pending chip and get its text back in the textarea, so that I can fix a typo and re-enqueue without retyping.
4. As a coding session driver, I want to delete the pending chip, so that a mistaken instruction never executes.
5. As a coding session driver, I want to promote the pending chip to Steering, so that it is injected at the next request instead of waiting for the end of the Turn.
6. As a coding session driver, I want promotion to execute my instruction exactly once, so that I never pay a double LLM pass for the same text.
7. As a coding session driver, I want the composer locked to chip-plus-cancel while a message is pending, so that I cannot accidentally stack a second message.
8. As a coding session driver, I want attachments, skills, prompts and file comments disabled while drafting mid-Turn input, so that I never compose something the text-only queue would reject late with a cryptic error.
9. As a coding session driver, I want model and thinking-level pickers disabled while a Turn runs, so that I never believe I changed the upcoming step when the change can only apply to the next Turn.
10. As a coding session driver, I want the submit button to keep its current send-when-idle / cancel-when-running behaviour, so that my abort reflex does not move.
11. As a coding session driver, I want the Steering to never abort running tools, so that promotion is safe to press at any moment.
12. As a coding session driver, I want the injected instruction to appear in the transcript inside the active Turn, so that a delivered Steering is distinguishable from a lost one.
13. As a coding session driver, I want an untouched pending instruction to run on its own when the Turn winds down, so that I do nothing when the default timing is already right.
14. As a coding session driver, I want typing with no active Turn to open a fresh Turn on send, so that a message is never parked forever waiting for a prompt that never comes.
15. As a coding session driver, I want aborting with a pending chip to return its text to the textarea, so that my instruction survives the abort as a draft.
16. As a coding session driver, I want a pending chip to reappear after reloading the page, so that a refresh does not silently disarm my queued instruction.
17. As a coding session driver, I want a Turn failure with a pending chip to leave a defined, visible state with no phantom executions, so that I know exactly what is still armed.
18. As a coding session driver, I want a clear error with my text preserved when the worker is unreachable at enqueue time, so that nothing I wrote is lost to a network blip.

## Implementation Decisions

- Two-phase queue semantics: textarea send during an active Turn enqueues as end-of-Turn delivery; the chip's send action promotes to next-request delivery via a clear-then-enqueue step, which is the only promotion that keeps the two worker queues, the agent queues and the UI event in sync and avoids double execution of identical text.
- Single pending message, plain text only in v1: no images, attachments, skills, prompts or file comments travel with queue operations; the worker rejects non-text queue payloads fail-fast.
- Separate followUp button left of submit, visible only during an active Turn with the same send icon; submit keeps its existing idle-send / running-cancel duality so abort stays where muscle memory expects it.
- Locking scope: with a chip pending, the whole composer is disabled except chip actions and Turn cancel; during any active Turn, attachments, skills, prompts, comments, model and thinking pickers are disabled (no tooltip; they simply do not apply until the next Turn).
- Configuration never travels with queue operations: model and thinking-level changes mid-Turn are rejected worker-side for both fields symmetrically, and the UI disables both pickers while running; a change made while idle travels with the next prompt that opens a Turn, as today.
- Queue events drive the chip: the worker's queue-update event (steering plus follow-up pending lists) is the source of truth for chip visibility; delivery of a queued user message removes exactly one pending entry before it is rendered.
- Injected messages render inside the active Turn in the conversation, not as a new Turn; no new run identity is created by promotion.
- Rehydration: connecting with a snapshot that reports a running session also restores any pending queued text into the chip.
- Abort semantics: aborting the Turn with a pending chip clears the queue and returns the chip text to the textarea as an editable draft; deleting clears and discards; editing clears and returns the text for rework.

## Testing Decisions

- A good test asserts externally visible behaviour only: chip appears/disappears, transcript shows the injected message inside the active Turn, promotion executes the text exactly once, locked controls stay disabled, aborted text survives as a draft. No test reaches into queue internals or component state.
- Seams used (highest available, existing first): the worker RPC contract boundary for queue operations and pending-state reads; the AG-UI event stream boundary for queue-update and injected-message mapping; the Coding Agent UI composer/chip state boundary for disabled scopes and draft round-trips.
- Prior art: existing contract tests for worker RPC methods, translator tests mapping worker events to AG-UI events, hook and component tests for the coding session composer, and the repo's Playwright end-to-end scenarios for the happy path. Each ticket keeps the repo's fast suites green (lint, type-check, affected unit/component/integration/contract tests).

## Out of Scope

- More than one pending message; multiple-queue drain modes stay at their default.
- Attachments, images, skills, prompts or file comments inside queued instructions (v2).
- User-visible choice between end-of-Turn and next-request timing beyond the two-phase flow (enqueue, then optionally promote).
- Making a model or thinking-level change effective at the post-Steering step within the same Turn (requires abort-and-reissue; explicitly rejected for v1).
- Multi-tab queue conflicts beyond best-effort restore of surviving entries.
- Extension commands inside queued text (rejected, as they cannot be queued).

## Further Notes

- The underlying SDK keeps two independent queues with no deduplication, so naive enqueue-as-followUp plus enqueue-as-steer of the same text executes it twice at different loop points with double LLM cost; the clear-then-enqueue promotion exists specifically to close that trap.
- Text returned to the textarea on edit or abort is never auto-reenqueued: the user always confirms with one more explicit send.
