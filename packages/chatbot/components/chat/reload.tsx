import {
  ChevronUpIcon,
  RefreshCcw,
  FileSearch,
  Globe,
  Sparkles,
} from "lucide-react";
import { useChatContext } from "@/components/chat/provider";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils/helpers";
import { ModelItem } from "@/components/chat/model-picker";
import { CHAT_MODES, ChatMode } from "@/lib/features/chat/types";
import { MCPIcon } from "@/components/ui/icons";

const CHAT_MODE_LABELS: Record<ChatMode, string> = {
  auto: "Auto",
  rag: "RAG",
  context7: "Ctx7",
  web: "Web",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CHAT_MODE_ICONS: Record<ChatMode, React.ComponentType<any>> = {
  auto: Sparkles,
  rag: FileSearch,
  context7: MCPIcon,
  web: Globe,
};

export interface ChatReloadProps {
  isShown?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
}

export const ChatReload: React.FC<ChatReloadProps> = ({
  isShown: controlledIsShown,
  onToggle,
  onClose,
}) => {
  const { reload, availableModels, projectId } = useChatContext();
  const modelDropdown = useDropdown();
  const chatModeDropdown = useDropdown();

  const isModelShown = controlledIsShown ?? modelDropdown.isShown;
  const closeModel = onClose ?? modelDropdown.close;
  const modelTriggerProps = onToggle
    ? { onClick: onToggle }
    : modelDropdown.getDropdownTriggerProps();

  const isChatModeShown = chatModeDropdown.isShown;
  const closeChatMode = chatModeDropdown.close;
  const chatModeTriggerProps = chatModeDropdown.getDropdownTriggerProps();

  return (
    <div className="flex items-center gap-2 relative text-zinc-700 dark:text-zinc-200">
      <div
        onClick={() => reload()}
        className="cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors mr-2"
      >
        <RefreshCcw size={18} />
      </div>

      {/* Model Dropdown */}
      <div className="relative">
        <div
          {...modelTriggerProps}
          className="flex items-center gap-1 font-bold text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <span className="whitespace-nowrap">Model</span>
          <ChevronUpIcon
            size={16}
            className={cn(
              "transition-transform duration-300",
              isModelShown ? "rotate-0" : "rotate-180",
            )}
          />
        </div>
        <Dropdown.Popup
          isShown={isModelShown}
          close={closeModel}
          className="max-h-[400px] lg:max-h-[600px] overflow-auto scrollbar-none min-w-[200px]"
          variant="responsive-center"
        >
          {availableModels.map((model) => (
            <Dropdown.Item
              key={model}
              className="px-0 py-0 first:py-0 last:py-0"
              onClick={() => {
                reload({ selectedModel: model });
                closeModel();
              }}
            >
              <ModelItem name={model} />
            </Dropdown.Item>
          ))}
        </Dropdown.Popup>
      </div>

      {/* Chat Mode Dropdown */}
      {!projectId && (
        <div className="relative">
          <div
            {...chatModeTriggerProps}
            className="flex items-center gap-1 font-bold text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors capitalize"
          >
            <span className="whitespace-nowrap">Chat Mode</span>
            <ChevronUpIcon
              size={16}
              className={cn(
                "transition-transform duration-300",
                isChatModeShown ? "rotate-0" : "rotate-180",
              )}
            />
          </div>
          <Dropdown.Popup
            isShown={isChatModeShown}
            close={closeChatMode}
            variant="top-left"
          >
            {CHAT_MODES.map((chatModeItem) => {
              const ChatModeIcon = CHAT_MODE_ICONS[chatModeItem];
              return (
                <Dropdown.Item
                  key={chatModeItem}
                  onClick={() => {
                    reload({ chatMode: chatModeItem });
                    closeChatMode();
                  }}
                  className="flex-nowrap"
                >
                  <ChatModeIcon size={16} />
                  <span className="whitespace-nowrap capitalize">
                    {CHAT_MODE_LABELS[chatModeItem]}
                  </span>
                </Dropdown.Item>
              );
            })}
          </Dropdown.Popup>
        </div>
      )}
    </div>
  );
};
