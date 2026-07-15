"use client";

import { useState } from "react";
import { Edit } from "lucide-react";
import type { Message } from "@ag-ui/client";
import { AgentCodeChat } from "./agent-code-chat";
import { FileBrowserEntryButton } from "./file-browser/file-browser-entry-button";
import { FileBrowserProvider } from "./file-browser/file-browser-provider";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { ModelPickerSelector } from "@/components/chat/model-picker";
import { Button } from "@/components/ui/button";
import { Main } from "@/components/ui/main";
import { useCreateCodingAgentSession } from "@/lib/features/code/hooks/use-create-coding-agent-session";
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
  const { isCreatingSession, createNewSession } =
    useCreateCodingAgentSession({
      project,
      modelId,
    });

  return (
    <FileBrowserProvider project={project} sessionId={sessionId}>
      <Header.Container>
        <Header.Left>
          <Logo />
          <Button
            variant="icon"
            size="icon"
            type="button"
            aria-label="New coding agent session"
            title="New coding agent session"
            isLoading={isCreatingSession}
            onClick={() => {
              void createNewSession();
            }}
          >
            <Edit size={18} />
          </Button>
          <FileBrowserEntryButton project={project} sessionId={sessionId} />
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
    </FileBrowserProvider>
  );
};
