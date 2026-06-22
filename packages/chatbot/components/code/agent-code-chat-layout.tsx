"use client";

import { useState } from "react";
import type { Message } from "@ag-ui/client";
import { AgentCodeChat } from "./agent-code-chat";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { ModelPickerSelector } from "@/components/chat/model-picker";
import { Main } from "@/components/ui/main";
import type { chatModelId } from "@/lib/features/foundation-model/config";

export interface AgentCodeChatLayoutProps {
  project: string;
  sessionId: string;
  availableModels: string[];
  initialMessages: Message[];
  isInitiallyRunning: boolean;
}

export const AgentCodeChatLayout: React.FC<AgentCodeChatLayoutProps> = ({
  project,
  sessionId,
  availableModels,
  initialMessages,
  isInitiallyRunning,
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
          modelId={modelId}
          initialMessages={initialMessages}
          isInitiallyRunning={isInitiallyRunning}
        />
      </Main>
    </>
  );
};
