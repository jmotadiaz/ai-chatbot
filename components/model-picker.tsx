"use client";

import { Database, FileText, Globe, ImageIcon, Pen } from "lucide-react";
import { useChatContext } from "@/app/providers";
import { Select, useSelect } from "@/components/ui/select";
import { chatModelId, CHAT_MODELS, Company } from "@/lib/ai/models/definition";
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
} from "@/components/icons";
import { RAG_TOOL, WEB_SEARCH_TOOL } from "@/lib/ai/tools/types";

export const ModelPicker = () => {
  const { selectedModel, setSelectedModel } = useModelPicker();

  return (
    <ModelPickerSelector
      {...{ selectedModel, setSelectedModel, models: CHAT_MODELS }}
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
      className={cn(
        "lg:w-42 h-[20px] bg-gray-200 dark:bg-zinc-700 rounded-md",
        {
          "animate-pulse": animated,
        }
      )}
    />
  );
};

export interface ModelPickerSelectorProps {
  selectedModel: chatModelId;
  setSelectedModel: (model: chatModelId) => void;
  models: chatModelId[];
}

export const ModelPickerSelector: React.FC<ModelPickerSelectorProps> = ({
  selectedModel,
  setSelectedModel,
  models,
}) => {
  const { getSelectTriggerProps, getSelectContentProps, getSelectItemProps } =
    useSelect({
      value: selectedModel,
      onValueChange: setSelectedModel,
    });

  return (
    <Select.Container>
      <Select.Trigger {...getSelectTriggerProps()} />
      <Select.Dropdown
        {...getSelectContentProps()}
        className="max-h-[400px] lg:max-h-[600px] min-w-52 overflow-auto scrollbar-none"
      >
        {models.map((modelId) => (
          <Select.Item
            className="px-0"
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
  google: LogoIcon,
  xai: GrokIcon,
  deepseek: DeepseekIcon,
  perplexity: PerplexityIcon,
  alibaba: QwenIcon,
  moonshotai: MoonshotIcon,
  "ai chatbot": LogoIcon,
};

interface ModelItemProps {
  name: chatModelId;
}

const ModelItem: React.FC<ModelItemProps> = ({ name }) => {
  const config = getChatConfigurationByModelId(name);
  const CompanyIcon = icons[config.company] || LogoIcon;
  return (
    <div className="flex items-center space-x-5 pl-4 pr-8">
      <CompanyIcon size={20} />
      <div className="flex flex-col space-y-1">
        <div className="font-medium">{name}</div>
        <div className="flex flex-col text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center space-x-1">
            <span className="mr-1">Media:</span>
            <Pen size={13} />
            {config.supportedFiles.map((supportedFile) => {
              switch (supportedFile) {
                case "img":
                  return <ImageIcon key={supportedFile} size={13} />;
                case "pdf":
                  return <FileText key={supportedFile} size={13} />;
              }
            })}
          </div>
          <div className="flex items-center space-x-1">
            <span className="mr-1">Tools:</span>
            {([WEB_SEARCH_TOOL, RAG_TOOL] as const).map((tool) => {
              if (!config.disabledTools.includes(tool)) {
                switch (tool) {
                  case WEB_SEARCH_TOOL:
                    return <Globe key={tool} size={13} />;
                  case RAG_TOOL:
                    return <Database key={tool} size={13} />;
                }
              }
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export const useModelPicker = (): Omit<ModelPickerSelectorProps, "models"> => {
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
