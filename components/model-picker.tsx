"use client";

import { FileText, ImageIcon, Wrench } from "lucide-react";
import { useChatContext } from "@/app/(chat)/chat-provider";
import { Select, useSelect } from "@/components/ui/select";
import type { chatModelId, Company } from "@/lib/ai/models/definition";
import { cn } from "@/lib/utils";
import { getChatConfigurationByModelId } from "@/lib/ai/models/utils";
import {
  MetaIcon,
  ClaudeIcon,
  OpenaiIcon,
  LogoIcon,
  QwenIcon,
  DeepseekIcon,
  MoonshotIcon,
  GrokIcon,
  PerplexityIcon,
  GeminiIcon,
  TextIcon,
  MistralIcon,
  MiniMaxIcon,
} from "@/components/icons";

interface ModelPickerProps {
  id: string;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({ id }) => {
  const { selectedModel, setSelectedModel } = useModelPicker();
  const { availableModels } = useChatContext();

  return (
    <ModelPickerSelector
      id={id}
      {...{ selectedModel, setSelectedModel, models: availableModels }}
    />
  );
};

export interface ModelPickerLoadingProps {
  animated?: boolean;
}

export const ModelPickerLoading: React.FC<ModelPickerLoadingProps> = ({
  animated = true,
}) => {
  return (
    <div
      className={cn("w-42 h-[20px] bg-gray-200 dark:bg-zinc-700 rounded-md", {
        "animate-pulse": animated,
      })}
    />
  );
};

export interface ModelPickerSelectorProps {
  selectedModel: chatModelId;
  setSelectedModel: (model: chatModelId) => void;
  models: chatModelId[];
  id: string;
}

export const ModelPickerSelector: React.FC<ModelPickerSelectorProps> = ({
  selectedModel,
  setSelectedModel,
  models,
  id,
}) => {
  const { getSelectTriggerProps, getSelectContentProps, getSelectItemProps } =
    useSelect({
      value: selectedModel,
      onValueChange: setSelectedModel,
      id,
    });

  return (
    <Select.Container>
      <Select.Trigger className="text-[15px]" {...getSelectTriggerProps()} />
      <Select.Dropdown
        {...getSelectContentProps()}
        className="max-h-[400px] lg:max-h-[600px] min-w-64 overflow-auto scrollbar-none"
      >
        {models.map((modelId) => (
          <Select.Item
            className="px-0 py-0"
            {...getSelectItemProps(modelId)}
            key={modelId}
          >
            <ModelItem name={modelId} />
          </Select.Item>
        ))}
      </Select.Dropdown>
    </Select.Container>
  );
};

const icons: Record<Company, React.ComponentType<{ size: number }>> = {
  openai: OpenaiIcon,
  anthropic: ClaudeIcon,
  meta: MetaIcon,
  google: GeminiIcon,
  xai: GrokIcon,
  deepseek: DeepseekIcon,
  perplexity: PerplexityIcon,
  alibaba: QwenIcon,
  moonshotai: MoonshotIcon,
  mistral: MistralIcon,
  minimax: MiniMaxIcon,
  "ai chatbot": LogoIcon,
};

interface ModelItemProps {
  name: chatModelId;
}

export const ModelItem: React.FC<ModelItemProps> = ({ name }) => {
  const config = getChatConfigurationByModelId(name);
  const CompanyIcon = icons[config.company] || LogoIcon;
  return (
    <div className="flex items-center space-x-6 py-4 px-8 lg:pl-4">
      <CompanyIcon size={20} />
      <div className="flex flex-col space-y-1">
        <div className="font-medium text-[15px]">{name}</div>
        <div className="flex flex-col text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center space-x-1">
            <div className="font-mono font-medium text-lg relative top-[1px]">
              I:
            </div>
            <div>
              <TextIcon size={16} />
            </div>
            {config.supportedFiles.map((supportedFile) => {
              switch (supportedFile) {
                case "img":
                  return (
                    <div key={`${name}-supported-input-${supportedFile}`}>
                      <ImageIcon key={supportedFile} size={16} />
                    </div>
                  );
                case "pdf":
                  return (
                    <div key={`${name}-supported-input-${supportedFile}`}>
                      <FileText key={supportedFile} size={16} />
                    </div>
                  );
              }
            })}
            <div className="font-mono font-medium mx-2">|</div>
            <div className="font-mono font-medium text-lg relative top-[1px]">
              O:
            </div>
            <div>
              <TextIcon size={16} />
            </div>
            {config.supportedOutput.map((supportedFile) => {
              switch (supportedFile) {
                case "img":
                  return (
                    <div key={`${name}-supported-output-${supportedFile}`}>
                      <ImageIcon key={supportedFile} size={16} />
                    </div>
                  );
              }
            })}
            {config.toolCalling && (
              <>
                <div className="font-mono font-medium mx-2">|</div>
                <div>
                  <Wrench size={16} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const useModelPicker = (): Omit<
  ModelPickerSelectorProps,
  "models" | "id"
> => {
  const { selectedModel, setConfig } = useChatContext();

  const setSelectedModel = (model: chatModelId) => {
    setConfig({
      selectedModel: model,
      ...getChatConfigurationByModelId(model),
    });
  };

  return {
    selectedModel,
    setSelectedModel,
  };
};
