"use client";

import { Textarea } from "./textarea";
import { ChatControl } from "./chat-control";
import { ArrowDown } from "lucide-react";
import { cn } from "../lib/utils";
import { LoadingAssistantMessageIcon } from "./icons";
import { useGeneratedText } from "../lib/ai/hooks";
import { Tabs, useTabs } from "./ui/tabs";

const tabs = ["translate", "grammar"] as const;

const EnglishHelperChat: React.FC = () => {
  const { getPanelProps, getTabProps } = useTabs({ tabs });

  return (
    <div className="h-full pt-16 overflow-auto overflow-x-hidden">
      <div className="w-ful max-w-4xl mx-auto my-4">
        <Tabs.Container className="mb-8">
          <Tabs.Tab {...getTabProps("translate")}>Translate</Tabs.Tab>
          <Tabs.Tab {...getTabProps("grammar")}>Grammar</Tabs.Tab>
        </Tabs.Container>
        <Tabs.Panel {...getPanelProps("translate")}>
          <EnglishTranslateChat />
        </Tabs.Panel>
        <Tabs.Panel {...getPanelProps("grammar")}>
          <div>Grammar</div>
        </Tabs.Panel>
      </div>
    </div>
  );
};

export const EnglishTranslateChat: React.FC = () => {
  const { generate, input, handleInputChange, text, isLoading } =
    useGeneratedText({
      api: "/api/translate",
    });

  return (
    <>
      <div className="bg-(--background) w-full mb-9 pb-4 px-4 sm:px-0">
        <div className="relative w-full">
          <Textarea
            handleInputChange={handleInputChange}
            input={input}
            isLoading={isLoading}
          />
          <ChatControl
            Icon={ArrowDown}
            type="submit"
            className="absolute z-1 right-3 bottom-2"
            disabled={!input.trim()}
            isLoading={isLoading}
            onClick={() => {
              generate();
            }}
          />
        </div>
      </div>
      <div className={cn("w-full overflow-hidden relative text-lg h-full")}>
        <>
          {text}
          {isLoading && (
            <div className="ml-5 mt-2">
              <LoadingAssistantMessageIcon />
            </div>
          )}
        </>
      </div>
    </>
  );
};

export default EnglishHelperChat;
