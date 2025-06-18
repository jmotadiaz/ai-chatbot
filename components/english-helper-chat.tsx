"use client";

import { Textarea } from "./textarea";
import { ArrowDown } from "lucide-react";
import {
  useCompletion,
  experimental_useObject as useObject,
} from "@ai-sdk/react";
import { grammarSchema } from "@/lib/ai/schemas/grammar";
import { cn } from "@/lib/utils";
import { Tabs, useTabs } from "./ui/tabs";
import { ChatControl } from "./chat-control";
import { LoadingAssistantMessageIcon } from "./icons";
import { useState } from "react";
import { CopyBlock } from "./copy-block";

const tabs = ["translate", "grammar"] as const;

const EnglishHelperChat: React.FC = () => {
  const { getPanelProps, getTabProps } = useTabs({ tabs });

  return (
    <div className="h-full pt-16 overflow-auto overflow-x-hidden px-4 sm:px-0">
      <div className="w-ful max-w-4xl mx-auto my-4">
        <Tabs.Container className="mb-8">
          <Tabs.Tab {...getTabProps("translate")}>Translate</Tabs.Tab>
          <Tabs.Tab {...getTabProps("grammar")}>Grammar</Tabs.Tab>
        </Tabs.Container>
        <div className="px-0 sm:px-8">
          <Tabs.Panel {...getPanelProps("translate")}>
            <EnglishTranslateChat />
          </Tabs.Panel>
          <Tabs.Panel {...getPanelProps("grammar")}>
            <EnglishGrammarChat />
          </Tabs.Panel>
        </div>
      </div>
    </div>
  );
};

export const EnglishTranslateChat: React.FC = () => {
  const { handleSubmit, input, handleInputChange, completion, isLoading } =
    useCompletion({
      api: "/api/english/translate",
    });

  return (
    <>
      <div className="bg-(--background) w-full mb-9 pb-4">
        <form onSubmit={handleSubmit} className="relative w-full">
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
          />
        </form>
      </div>
      <div
        className={cn(
          "w-full overflow-hidden relative text-lg h-full overflow-y-auto"
        )}
      >
        <>
          {completion && (
            <>
              <div className="font-semibold mb-2">Translation:</div>
              <CopyBlock className="p-3" text={completion}>
                {completion}
              </CopyBlock>
            </>
          )}
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

const EnglishGrammarChat: React.FC = () => {
  const [input, setInput] = useState("");
  const { object, submit, isLoading } = useObject({
    api: "/api/english/grammar",
    schema: grammarSchema,
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  return (
    <>
      <div className="bg-(--background) w-full mb-9 pb-4">
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
              submit(input);
            }}
          />
        </div>
      </div>
      <div
        className={cn(
          "w-full overflow-hidden relative text-lg h-full overflow-y-auto"
        )}
      >
        {object && (
          <>
            <div className="flex flex-col gap-2">
              <div>
                <div className="font-semibold mb-2">Corrected Text:</div>
                <CopyBlock className="p-3" text={object.textCorrected}>
                  {object.textCorrected}
                </CopyBlock>
              </div>
              <div>
                <div className="font-semibold mb-2">Reasons:</div>
                <ul className="list-disc pl-5 text-gray-800 dark:text-gray-200">
                  {object.reasons?.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
        {isLoading && (
          <div className="ml-5 mt-2">
            <LoadingAssistantMessageIcon />
          </div>
        )}
      </div>
    </>
  );
};

export default EnglishHelperChat;
