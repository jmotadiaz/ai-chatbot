"use client";

import { useEffect, useState } from "react";
import { Textarea } from "./textarea";
import { ProjectOverview } from "./project-overview";
import { Messages } from "./messages";
import { useChatContext } from "../app/providers";

export interface ChatProps {
  saveChat?: React.ReactNode;
}

export default function Chat({ saveChat }: ChatProps) {
  const [temperature, setTemperature] = useState<number>(0.2);
  const [topP, setTopP] = useState<number>(0.95);
  const [topK, setTopK] = useState<number>(30);

  const {
    messages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    status,
    stop,
    setConfig,
  } = useChatContext();

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    setConfig({
      temperature,
      topP,
      topK,
    });
  }, [temperature, topP, topK, setConfig]);

  return (
    <>
      {messages.length === 0 ? (
        <div className="max-w-xl mx-auto w-full pt-16">
          <ProjectOverview />
        </div>
      ) : (
        <Messages messages={messages} isLoading={isLoading} status={status} />
      )}
      <form
        onSubmit={handleSubmit}
        className="bg-(--background) w-full max-w-xl mx-auto px-4 sm:px-0 relative"
      >
        <Textarea
          handleInputChange={handleInputChange}
          messages={messages}
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
        <div className="absolute z-20 left-10 bottom-1">{saveChat}</div>
      </form>
    </>
  );
}
