# Coding Agent UI Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace bare-bones coding agent UI with reused chatbot components (Header, Textarea, ChatControl, Response, ChatNavigation) by creating a layout wrapper + dedicated AgentConversation + AgentMessage components.

**Architecture:** Server component (AgentCodeChatLayout) composes Header + Main + client AgentCodeChat. AgentCodeChat uses AgentConversation for messages (with Response markdown) and Textarea + ChatControl for input. useCodingAgent hook unchanged.

**Tech Stack:** Next.js 16.1 (App Router), React 19, Tailwind CSS 4, shadcn/ui, Streamdown, lucide-react

---

### Task 1: Create AgentCodeChatLayout (server component)

**Files:**
- Create: `packages/chatbot/components/agent-code/agent-code-chat-layout.tsx`

- [ ] **Step 1: Create the layout component**

The layout is a client component (because `AgentCodeChat` needs model state available in the header). It manages `modelId` state and passes it to both `ModelPickerSelector` (header) and `AgentCodeChat` (chat area).

`packages/chatbot/components/agent-code/agent-code-chat-layout.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { ModelPickerSelector } from "@/components/chat/model-picker";
import { Main } from "@/components/ui/main";
import { AgentCodeChat } from "./agent-code-chat";
import type { chatModelId } from "@/lib/features/foundation-model/config";

export interface AgentCodeChatLayoutProps {
  project: string;
  sessionId: string;
  availableModels: string[];
}

export const AgentCodeChatLayout: React.FC<AgentCodeChatLayoutProps> = ({
  project,
  sessionId,
  availableModels,
}) => {
  const [modelId, setModelId] = useState<string>(availableModels[0] ?? "");

  return (
    <>
      <Header.Container>
        <Header.Left>
          <Logo />
          <ModelPickerSelector
            id="coding-agent-model"
            selectedModel={modelId as chatModelId}
            setSelectedModel={setModelId as (m: chatModelId) => void}
            models={availableModels as chatModelId[]}
          />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <Main>
        <AgentCodeChat
          project={project}
          sessionId={sessionId}
          availableModels={availableModels}
          modelId={modelId}
          setModelId={setModelId}
        />
      </Main>
    </>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/chatbot/components/agent-code/agent-code-chat-layout.tsx
git commit -m "feat: add AgentCodeChatLayout with Header reuse"
```

---

### Task 2: Create AgentMessage component

**Files:**
- Create: `packages/chatbot/components/agent-code/agent-message.tsx`

- [ ] **Step 1: Create the AgentMessage component**

This renders a single message bubble. Assistant messages use `Response` (Streamdown markdown). User messages use a simple styled bubble (matching chatbot's UserMessage style).

```tsx
"use client";

import { memo } from "react";
import { cn } from "@/lib/utils/helpers";
import { Response } from "@/components/chat/response";

export interface AgentMessageProps {
  role: "user" | "assistant";
  content: string;
}

export const AgentMessage: React.FC<AgentMessageProps> = memo(
  ({ role, content }) => {
    if (role === "user") {
      return (
        <div className="mb-8 pt-4">
          <div className="flex gap-4 w-full ml-auto max-w-full w-fit">
            <div className="flex flex-col w-full space-y-2">
              <div className="flex flex-col max-w-full bg-secondary py-4 pl-4 pr-8 rounded-tl-3xl rounded-br-3xl rounded-bl-3xl">
                {content}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="mb-8 pt-4">
        <div className="flex flex-col w-full space-y-4">
          <Response>{content}</Response>
        </div>
      </div>
    );
  },
);

AgentMessage.displayName = "AgentMessage";
```

- [ ] **Step 2: Commit**

```bash
git add packages/chatbot/components/agent-code/agent-message.tsx
git commit -m "feat: add AgentMessage component with Response markdown"
```

---

### Task 3: Create AgentConversation component

**Files:**
- Create: `packages/chatbot/components/agent-code/agent-conversation.tsx`

- [ ] **Step 1: Create the AgentConversation component**

Scrollable message list with scroll navigation and loading indicator. Ports IntersectionObserver logic from `useChatNavigation`.

```tsx
"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils/helpers";
import { AgentMessage } from "./agent-message";
import { ChatNavigation } from "@/components/chat/navigation";

export interface AgentConversationProps {
  messages: Array<{ role: string; content: string }>;
  isRunning: boolean;
}

export const AgentConversation: React.FC<AgentConversationProps> = ({
  messages,
  isRunning,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  const checkVisibility = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    setShowTop(container.scrollTop > 100);
    setShowBottom(
      container.scrollTop + container.clientHeight <
        container.scrollHeight - 100,
    );
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener("scroll", checkVisibility);
    checkVisibility();
    return () => container.removeEventListener("scroll", checkVisibility);
  }, [checkVisibility]);

  useEffect(() => {
    checkVisibility();
  }, [messages, checkVisibility]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages.length]);

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToBottom = () => {
    scrollContainerRef.current?.scrollTo({
      top: scrollContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  return (
    <div className="w-full relative overflow-y-hidden flex-1">
      <div
        className="w-full h-full overflow-y-auto"
        ref={scrollContainerRef}
      >
        {messages.length === 0 && !isRunning && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Ask the coding agent a question to get started.
          </div>
        )}
        <div ref={topSentinelRef} className="h-[1px] w-full" />
        <div className="min-h-[calc(100%-2px)] max-w-5xl mx-auto px-8 pb-15">
          {messages.map((msg, idx) => (
            <AgentMessage
              key={idx}
              role={msg.role as "user" | "assistant"}
              content={msg.content}
            />
          ))}
          {isRunning && (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <div className="animate-spin h-5 w-5 rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm">Running...</span>
            </div>
          )}
        </div>
        <div ref={bottomSentinelRef} className="h-[1px] w-full" />
      </div>
      <ChatNavigation
        showPrev={false}
        showNext={false}
        showBottom={showBottom}
        showTop={showTop}
        scrollToPrev={() => {}}
        scrollToNext={() => {}}
        scrollToBottom={scrollToBottom}
        scrollToTop={scrollToTop}
        className="bottom-4"
      />
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/chatbot/components/agent-code/agent-conversation.tsx
git commit -m "feat: add AgentConversation with scroll nav and loading"
```

---

### Task 4: Rewrite AgentCodeChat component

**Files:**
- Modify: `packages/chatbot/components/agent-code/agent-code-chat.tsx`

- [ ] **Step 1: Rewrite AgentCodeChat**

Replace the inline UI with reused components: `Textarea`, `ChatControl`, `AgentConversation`. `modelId` and `setModelId` come from the layout (where ModelPickerSelector lives in the header). `useCodingAgent` hook remains unchanged.

```tsx
"use client";

import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { Textarea } from "@/components/chat/textarea";
import { ChatControl } from "@/components/chat/control";
import { AgentConversation } from "./agent-conversation";
import { useCodingAgent } from "@/lib/features/agent-code/hooks/use-coding-agent";

export interface AgentCodeChatProps {
  project: string;
  sessionId: string;
  availableModels: string[];
  modelId: string;
  setModelId: (model: string) => void;
}

export const AgentCodeChat: React.FC<AgentCodeChatProps> = ({
  project,
  sessionId,
  availableModels,
  modelId,
  setModelId,
}) => {
  const [input, setInput] = useState("");
  const { messages, isRunning, sendMessage } = useCodingAgent({
    project,
    sessionId,
    modelId,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    await sendMessage(input);
    setInput("");
  };

  const isLoading = isRunning;

  return (
    <div
      data-testid="chat-container"
      className="flex flex-col relative h-full pt-16"
    >
      <AgentConversation messages={messages} isRunning={isRunning} />
      <form
        onSubmit={handleSubmit}
        className="bg-(--background) w-full max-w-5xl mx-auto pb-4 px-4 relative"
      >
        <div className="relative w-full">
          <Textarea
            onChangeInput={setInput}
            input={input}
            isLoading={isLoading}
            placeholder="Ask the coding agent..."
          />
          <div className="absolute right-3 bottom-2 flex items-center space-x-2">
            <ChatControl
              Icon={ArrowUp}
              type="submit"
              aria-label="Send message"
              disabled={!input.trim() || isLoading}
              isLoading={isLoading}
            />
          </div>
        </div>
      </form>
    </div>
  );
};
```

Note: `modelId`/`setModelId` are passed from the layout (where ModelPicker lives in the header). The form wrapping matches the chatbot pattern.

- [ ] **Step 2: Commit**

```bash
git add packages/chatbot/components/agent-code/agent-code-chat.tsx
git commit -m "refactor: rewrite AgentCodeChat with reused components"
```

---

### Task 5: Update page.tsx and delete execution-indicator

**Files:**
- Modify: `packages/chatbot/app/(chat)/agent/code/[project]/[sessionId]/page.tsx`
- Delete: `packages/chatbot/components/agent-code/execution-indicator.tsx`

- [ ] **Step 1: Update the page to use AgentCodeChatLayout**

```tsx
import { notFound } from "next/navigation";
import { AgentCodeChatLayout } from "@/components/agent-code/agent-code-chat-layout";
import { getCodingAgentModels } from "@/lib/features/agent-code/actions";

export default async function CodingAgentChatPage({
  params,
}: {
  params: Promise<{ project: string; sessionId: string }>;
}) {
  if (process.env.CODING_AGENT_ENABLED !== "true") return notFound();
  const { project, sessionId } = await params;
  const models = await getCodingAgentModels();
  return (
    <AgentCodeChatLayout
      project={project}
      sessionId={sessionId}
      availableModels={models}
    />
  );
}
```

- [ ] **Step 2: Delete execution-indicator.tsx**

```bash
rm packages/chatbot/components/agent-code/execution-indicator.tsx
```

- [ ] **Step 3: Run lint and build**

```bash
pnpm lint:fix
pnpm next build --no-lint
```

- [ ] **Step 4: Commit**

```bash
git add packages/chatbot/app/(chat)/agent/code/\\[project\\]/\\[sessionId\\]/page.tsx
git add -u
git commit -m "feat: wire up AgentCodeChatLayout, remove old execution-indicator"
```

---

### Verification

After all tasks:

1. Navigate to `/agent/code/<project>/<sessionId>`
2. Verify Header renders with Logo + ThemeToggle
3. Verify input area shows Textarea with placeholder
4. Type a message, hit Enter — verify it sends and shows in conversation
5. Verify assistant response renders with markdown (code blocks highlighted)
6. Verify scroll navigation appears when conversation is long enough
7. Verify loading indicator shows while agent is running
