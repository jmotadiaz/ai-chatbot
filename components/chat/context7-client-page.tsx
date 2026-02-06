"use client";

import React from "react";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { Context7Chat } from "@/components/chat/context7";
import { useContext7Chat } from "@/lib/features/chat/hooks/use-context7-chat";
import { ModelPickerSelector } from "@/components/chat/model-picker";

export const Context7ClientPage: React.FC = () => {
  const chatResult = useContext7Chat();
  const { selectedModel, setConfig, availableModels } = chatResult;

  return (
    <>
      <Header.Container>
        <Header.Left>
          <Logo />
        </Header.Left>
        <div className="flex items-center gap-2">
          <ModelPickerSelector
            id="context7-model-picker"
            selectedModel={selectedModel}
            setSelectedModel={(model) => setConfig({ selectedModel: model })}
            models={availableModels}
          />
        </div>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <Context7Chat chatResult={chatResult} />
    </>
  );
};
