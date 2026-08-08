"use client";

import { Edit } from "lucide-react";
import type { ThinkingLevel } from "models";
import { AgentCodeChat } from "./agent-code-chat";
import { FileBrowserEntryButton } from "./file-browser/file-browser-entry-button";
import { FileBrowserProvider } from "./file-browser/file-browser-provider";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import {
  ModelPickerLoading,
  ModelPickerSelector,
} from "@/components/chat/model-picker";
import { Button } from "@/components/ui/button";
import { Main } from "@/components/ui/main";
import { useCodingAgentSessionModel } from "@/lib/features/code/hooks/use-coding-agent-session-model";
import { useCreateCodingAgentSession } from "@/lib/features/code/hooks/use-create-coding-agent-session";
import type { chatModelId } from "@/lib/features/foundation-model/config";

/** Lo que la UI necesita saber del razonamiento de un modelo del picker. */
export interface ModelThinking {
  levels: ThinkingLevel[];
  defaultLevel: ThinkingLevel | undefined;
}

export interface AgentCodeChatLayoutProps {
  project: string;
  sessionId: string;
  availableModels: string[];
  modelThinking: ReadonlyMap<string, ModelThinking>;
}

export const AgentCodeChatLayout: React.FC<AgentCodeChatLayoutProps> = ({
  project,
  sessionId,
  availableModels,
  modelThinking,
}) => {
  const {
    modelId,
    setModelId,
    isLoading: isLoadingModel,
  } = useCodingAgentSessionModel({
    sessionId,
    fallbackModelId: availableModels[0] ?? "",
  });
  const { isCreatingSession, createNewSession } =
    useCreateCodingAgentSession({
      project,
      modelId: modelId ?? "",
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
          {isLoadingModel ? (
            <ModelPickerLoading />
          ) : (
            <ModelPickerSelector
              id="coding-agent-model"
              selectedModel={modelId as chatModelId}
              setSelectedModel={setModelId as (m: chatModelId) => void}
              models={availableModels as chatModelId[]}
              dropdownVariant="responsive-bottom-right"
            />
          )}
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <Main>
        <AgentCodeChat
          project={project}
          sessionId={sessionId}
          modelId={modelId ?? ""}
          modelThinking={modelThinking}
        />
      </Main>
    </FileBrowserProvider>
  );
};
