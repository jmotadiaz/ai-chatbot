"use client";

import { ArrowDown, Speaker } from "lucide-react";
import { useCompletion, UseCompletionHelpers } from "@ai-sdk/react";
import { Tabs, useTabs } from "@/components/ui/tabs";
import { ChatControl } from "@/components/chat-control";
import { LoadingAssistantMessageIcon, SpinnerIcon } from "@/components/icons";
import { Textarea } from "@/components/textarea";
import { CopyBlock } from "@/components/copy-block";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import { grammarSchema } from "@/lib/ai/schemas/grammar";
import { useObject, UseObjectReturn, useSpeech } from "@/lib/ai/hooks";
import { Button } from "@/components/ui/button";

const tabs = ["translate", "grammar"] as const;

const EnglishHelperChat: React.FC = () => {
  const { getPanelProps, getTabProps } = useTabs({ tabs });
  const completionResult = useCompletion({
    api: "/api/english/translate",
    experimental_throttle: 100,
  });
  const objectResult = useObject({
    api: "/api/english/grammar",
    schema: grammarSchema,
  });

  return (
    <div className="h-full pt-24 overflow-auto overflow-x-hidden px-4">
      <div className="w-ful max-w-4xl mx-auto my-4">
        <Tabs.Container className="mb-8">
          <Tabs.Tab {...getTabProps("translate")}>Translate</Tabs.Tab>
          <Tabs.Tab {...getTabProps("grammar")}>Grammar</Tabs.Tab>
        </Tabs.Container>
        <div className="px-0 md:px-8">
          <Tabs.Panel {...getPanelProps("translate")}>
            <EnglishTranslateChat {...completionResult} />
          </Tabs.Panel>
          <Tabs.Panel {...getPanelProps("grammar")}>
            <EnglishGrammarChat {...objectResult} />
          </Tabs.Panel>
        </div>
      </div>
    </div>
  );
};

type TranslateChatProps = Pick<
  UseCompletionHelpers,
  "handleSubmit" | "input" | "handleInputChange" | "completion" | "isLoading"
>;

export const EnglishTranslateChat: React.FC<TranslateChatProps> = ({
  handleSubmit,
  input,
  handleInputChange,
  completion,
  isLoading,
}) => {
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
              <div className="font-semibold animate-fade">Translation:</div>
              <CopyBlock className="p-3 animate-fade" text={completion}>
                <Markdown>{completion}</Markdown>
              </CopyBlock>
              <SpeechControl input={completion} className="my-2" />
            </>
          )}
          {isLoading && (
            <div className="ml-5 mt-2 pb-4">
              <LoadingAssistantMessageIcon />
            </div>
          )}
        </>
      </div>
    </>
  );
};

type GrammarChatProps = Pick<
  UseObjectReturn<typeof grammarSchema>,
  "object" | "handleSubmit" | "isLoading" | "input" | "handleInputChange"
>;

const EnglishGrammarChat: React.FC<GrammarChatProps> = ({
  object,
  isLoading,
  input,
  handleInputChange,
  handleSubmit,
}) => {
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
        {object && (
          <>
            <div className="flex flex-col gap-2">
              <div>
                <div className="font-semibold animate-fade">
                  Corrected Text:
                </div>
                <CopyBlock
                  className="p-3 animate-fade"
                  text={object.correctedText}
                >
                  <Markdown>{object.correctedText || ""}</Markdown>
                </CopyBlock>
                {object.correctedText && (
                  <SpeechControl
                    input={object.correctedText}
                    className="my-2"
                  />
                )}
              </div>
              <div>
                {!!object.reasons?.length && (
                  <>
                    <div className="font-semibold mb-2 animate-fade">
                      Reasons:
                    </div>
                    <ul className="list-disc pl-5 text-gray-800 dark:text-gray-200 animate-fade">
                      {object.reasons?.map((reason, index) => (
                        <li className="animate-fade" key={index}>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </>
        )}
        {isLoading && (
          <div className="ml-5 mt-2 pb-4">
            <LoadingAssistantMessageIcon />
          </div>
        )}
      </div>
    </>
  );
};

const SpeechControl: React.FC<{ input: string; className: string }> = ({
  input,
  className,
}) => {
  const { generateSpeech, audioUrl, isGenerating } = useSpeech({
    input,
  });

  return (
    <div className={className}>
      <div className="font-semibold mb-2 animate-fade">Speech:</div>
      <div className={"min-h-16 flex items-center"}>
        {audioUrl ? (
          <audio className="animate-fade" controls src={audioUrl} autoPlay>
            Your browser does not support the audio element.
          </audio>
        ) : (
          <Button
            variant="secondary"
            className="min-w-18 flex items-center animate-fade"
            onClick={generateSpeech}
          >
            {isGenerating ? (
              <div className="animate-spin">
                <SpinnerIcon />
              </div>
            ) : (
              <Speaker />
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

export default EnglishHelperChat;
