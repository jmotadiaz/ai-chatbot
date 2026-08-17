# Unify Session IDs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate session ID indirection between chatbot and Pi worker by passing the app `sessionId` directly to Pi's `SessionManager.create`.

**Architecture:** Pi creates sessions with `options: { id: sessionId }`, making disk files, in-memory entries, and PostgreSQL rows share the exact same `sessionId`. The nullable `pi_session_id` DB column remains in schema as unused, while removing `updatePiSessionId` DB writes, RPC `piSessionId` parameters, and UI `?pi=` query params.

**Tech Stack:** TypeScript, Next.js 16 (App Router), Drizzle ORM, PostgreSQL, `@earendil-works/pi-coding-agent`, TypeBox, Vitest.

---

### Task 1: Coding-Agent Worker — Unify Session ID in SessionManager & RPC Transport

**Files:**
- Modify: `packages/coding-agent/src/session-manager.ts`
- Modify: `packages/coding-agent/src/subagent-bridge.ts`
- Modify: `packages/coding-agent/src/transports/http.ts`
- Modify: `packages/coding-agent/extensions/subagent/index.ts`
- Test: `packages/coding-agent/tests/integration/session-manager-connect.test.ts`
- Test: `packages/coding-agent/tests/integration/session-manager-attachments.test.ts`
- Test: `packages/coding-agent/tests/integration/session-manager-files-changed.test.ts`
- Test: `packages/coding-agent/tests/integration/session-manager-prompts.test.ts`
- Test: `packages/coding-agent/tests/integration/session-manager-reconnect.test.ts`
- Test: `packages/coding-agent/tests/integration/session-manager-skills.test.ts`
- Test: `packages/coding-agent/tests/integration/session-manager-subagent-guard.test.ts`
- Test: `packages/coding-agent/tests/integration/session-manager-subagent-lookup.test.ts`
- Test: `packages/coding-agent/tests/integration/session-manager-thinking-level.test.ts`
- Test: `packages/coding-agent/tests/integration/session-manager-thinking-level-reload.test.ts`
- Test: `packages/coding-agent/tests/contract/subagent-extension.test.ts`
- Test: `packages/coding-agent/tests/unit/subagent-bridge.test.ts`

- [x] **Step 1: Update `session-manager.ts` to pass `{ id: sessionId }` to Pi's `SessionManager.create` and drop `piSessionId` from `SessionEntry`**
- [x] **Step 2: Update `loadSessionFromDisk` to find sessions by `sessionId` on disk**
- [x] **Step 3: Update subagent creation and `subagent-bridge.ts` to drop `subPiSessionId`**
- [x] **Step 4: Update `transports/http.ts` RPC schemas & handlers to remove `piSessionId`**
- [x] **Step 5: Update coding-agent unit, integration, and contract tests**
- [x] **Step 6: Run `pnpm --filter coding-agent test:all` to verify all tests pass**

---

### Task 2: Chatbot Store — Remove `updatePiSessionId` (Keep DB column unused)

**Files:**
- Modify: `packages/chatbot/lib/features/code/session-store.ts`

- [x] **Step 1: Remove `updatePiSessionId` from `session-store.ts`**

---

### Task 3: Chatbot WorkerClient & SSR Bootstrap — Clean Up RPC Boundary

**Files:**
- Modify: `packages/chatbot/lib/features/code/worker-client.ts`
- Modify: `packages/chatbot/lib/features/code/session-bootstrap.ts`
- Modify: `packages/chatbot/lib/features/code/actions.ts`

- [x] **Step 1: Update `WorkerClient` method signatures to drop `piSessionId`**
- [x] **Step 2: Update `session-bootstrap.ts` (`loadCodingAgentBootstrap`, `loadCodingAgentSnapshot`, `fetchSnapshot`)**
- [x] **Step 3: Update `actions.ts` (`fetchSubagentSession`)**

---

### Task 4: Chatbot Routes & UI Components — Remove `piSessionId` and URL Query Params

**Files:**
- Modify: `packages/chatbot/app/(chat)/api/agent/code/route.ts`
- Modify: `packages/chatbot/app/(chat)/api/agent/code/connect/route.ts`
- Modify: `packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/snapshot/route.ts`
- Modify: `packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/model/route.ts`
- Modify: `packages/chatbot/app/(chat)/api/agent/code/sessions/[sessionId]/thinking-level/route.ts`
- Modify: `packages/chatbot/components/code/subagent-tool-link.tsx`
- Modify: `packages/chatbot/components/code/subagent-session-view.tsx`
- Modify: `packages/chatbot/app/(chat)/agent/code/[project]/[sessionId]/subagent/[subSessionId]/page.tsx`
- Modify: `packages/chatbot/lib/features/code/hooks/use-coding-agent.ts`

- [x] **Step 1: Clean up `api/agent/code/route.ts` and BFF route handlers**
- [x] **Step 2: Clean up `subagent-tool-link.tsx`, `subagent-session-view.tsx`, and `subagent/[subSessionId]/page.tsx`**
- [x] **Step 3: Clean up `use-coding-agent.ts`**

---

### Task 5: Chatbot Tests & Monorepo Verification

**Files:**
- Modify: `packages/chatbot/tests/unit/agent-code/run-route-attachments.test.ts`
- Modify: `packages/chatbot/tests/unit/agent-code/run-route-thinking-level.test.ts`
- Modify: `packages/chatbot/tests/unit/agent-code/connect-route.test.ts`
- Modify: `packages/chatbot/tests/unit/agent-code/model-route.test.ts`
- Modify: `packages/chatbot/tests/unit/agent-code/prompts-route.test.ts`
- Modify: `packages/chatbot/tests/unit/agent-code/thinking-level-route.test.ts`
- Modify: `packages/chatbot/tests/unit/agent-code/worker-client.test.ts`
- Modify: `packages/chatbot/tests/unit/agent-code/worker-client-subagent.test.ts`
- Modify: `packages/chatbot/tests/component/agent-code/subagent-tool-link.test.tsx`
- Modify: `packages/chatbot/tests/component/agent-code/subagent-session-view.test.tsx`

- [x] **Step 1: Update chatbot unit and component tests**
- [x] **Step 2: Run `pnpm verify:fast` across the entire monorepo**
