# Design: Coding Agent UI Reuse from Chatbot

**Date:** 2026-06-15
**Status:** Approved

## Goal

Replace the bare-bones coding agent UI (`AgentCodeChat`) with components reused from the chatbot: `Header`, `Textarea`, `ChatControl`, `ChatNavigation`, and `Response` (Streamdown markdown). Keep the `useCodingAgent` hook unchanged.

## Scope

| Reuse | Don't reuse |
|-------|-------------|
| `Header` compound component (Logo, ThemeToggle) | `ChatProvider` / context |
| `Textarea` (auto-resize, shimmer) | `ChatConversation` (expects ChatbotMessage[]) |
| `ChatControl` (send/stop button) | `Message` component (complex part-based) |
| `ChatNavigation` (scroll arrows) | Attachments, agent selector, settings |
| `Response` (Streamdown markdown) | `ChatReload`, `Reasoning`, sources |
| `ModelPickerSelector` (already reused) | `ProjectOverview` empty state |

## Component Tree

```
page.tsx (server) → AgentCodeChatLayout (NEW, server)
  ├── Header.Container
  │   ├── Header.Left → Logo, ModelPickerSelector
  │   └── Header.Right → ThemeToggle
  ├── Main
  │   └── AgentCodeChat (REWRITTEN, client)
  │       ├── AgentConversation (NEW)
  │       │   ├── AgentMessage[] (NEW)
  │       │   │   └── Response (Streamdown, for assistant messages)
  │       │   ├── ChatNavigation (REUSED)
  │       │   └── ExecutionIndicator (inline, was its own file)
  │       └── <form>
  │           ├── Textarea (REUSED)
  │           └── ChatControl (REUSED, ArrowUp icon)
```

## Files

| Action | File | Purpose |
|--------|------|---------|
| NEW | `components/agent-code/agent-code-chat-layout.tsx` | Server component composing Header + AgentCodeChat |
| NEW | `components/agent-code/agent-conversation.tsx` | Scrollable message list with ChatNavigation + loading state |
| NEW | `components/agent-code/agent-message.tsx` | User/assistant message bubbles with Response markdown |
| MODIFY | `components/agent-code/agent-code-chat.tsx` | Rewrite to compose AgentConversation + Textarea + ChatControl |
| MODIFY | `app/(chat)/agent/code/[project]/[sessionId]/page.tsx` | Use new AgentCodeChatLayout |
| DELETE | `components/agent-code/execution-indicator.tsx` | Merged inline into AgentConversation |

## Component Interfaces

```ts
// AgentCodeChatLayout (server)
interface AgentCodeChatLayoutProps {
  project: string;
  sessionId: string;
  availableModels: string[];
}

// AgentCodeChat (client, rewritten)
interface AgentCodeChatProps {
  project: string;
  sessionId: string;
  availableModels: string[];
}
// Internal: useCodingAgent + local input/modelId state

// AgentConversation (new)
interface AgentConversationProps {
  messages: Array<{ role: string; content: string }>;
  isRunning: boolean;
}

// AgentMessage (new)
interface AgentMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}
```

## Message Rendering

- **User messages**: Tailwind bubble (`bg-secondary rounded-tl-3xl rounded-br-3xl rounded-bl-3xl`), plain text, no file thumbnails
- **Assistant messages**: `Response` component with Streamdown — code highlighting, Mermaid diagrams, math. Provides proper syntax highlighting for code blocks, critical for a coding agent.

## Scroll Navigation

Reuse `ChatNavigation` directly. Port the `IntersectionObserver` sentinel pattern from `useChatNavigation` hook into AgentConversation as inline logic (no refactor of the existing hook).

## Input Area

- `Textarea` with placeholder "Ask the coding agent..."
- `ChatControl` with `ArrowUp` icon → submit; spinner on click → stop
- No attachments, no agent selector, no settings controls

## Unchanged

- `useCodingAgent` hook — no changes
- `ModelPickerSelector` — already reused
- Route structure — no changes
- Feature flag `CODING_AGENT_ENABLED` — no changes
- All styling via existing Tailwind theme tokens — no new CSS

## Deleted

- `execution-indicator.tsx` — merged into `AgentConversation`
- All inline styles/elements from old `AgentCodeChat`
