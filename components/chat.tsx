"use client";

import { defaultModel, modelID } from "@/app/(chat)/providers";
import { Message, useChat } from "@ai-sdk/react";
import { useState, useEffect } from "react";
import { Textarea } from "./textarea";
import { ProjectOverview } from "./project-overview";
import { Messages } from "./messages";
import { Header } from "./header";
import { toast } from "sonner";
import Sidebar from "./sidebar";
import { useSessionStorageState } from "@/lib/hooks/use-session-storage-state";

export default function Chat() {
  const [selectedModel, setSelectedModel] = useSessionStorageState<modelID>(
    "selectedModel",
    defaultModel
  );
  const [showSidebar, setShowSidebar] = useState(false);
  const [temperature, setTemperature] = useState<number>(0.2);
  const [topP, setTopP] = useState<number>(0.95);
  const [topK, setTopK] = useState<number>(30);
  const [initialMessages, setInitialMessages] = useSessionStorageState<
    Message[]
  >("messages", []);

  const {
    messages,
    setMessages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    status,
    stop,
  } = useChat({
    initialMessages,
    maxSteps: 5,
    experimental_throttle: 100,
    body: {
      selectedModel,
      temperature,
      topP,
      topK,
    },
    onError: (error) => {
      toast.error(
        error.message.length > 0
          ? error.message
          : "An error happened, please try again later.",
        { position: "top-center", richColors: true }
      );
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (messages.length) {
      setInitialMessages(messages);
    }
  }, [messages, setInitialMessages]);

  const handleNewChat = () => {
    sessionStorage.removeItem("chat");
    setMessages([]);
    setInitialMessages([]);
  };

  return (
    <>
      <Sidebar open={showSidebar} onClose={() => setShowSidebar(false)} />
      <div className="h-dvh flex flex-col justify-center w-full stretch">
        <Header
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          onNewChat={handleNewChat}
          onClickLogo={() => setShowSidebar((prev) => !prev)}
        />
        {messages.length === 0 ? (
          <div className="max-w-xl mx-auto w-full">
            <ProjectOverview />
          </div>
        ) : (
          <Messages messages={messages} isLoading={isLoading} status={status} />
        )}
        <form
          onSubmit={handleSubmit}
          className="pb-8 bg-(--background) w-full max-w-xl mx-auto px-4 sm:px-0"
        >
          <Textarea
            handleInputChange={handleInputChange}
            input={input}
            setInput={setInput}
            isLoading={isLoading}
            status={status}
            stop={stop}
            temperature={temperature}
            topP={topP}
            topK={topK}
            setTemperature={setTemperature}
            setTopP={setTopP}
            setTopK={setTopK}
          />
        </form>
      </div>
    </>
  );
}
