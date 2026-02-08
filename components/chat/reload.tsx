import { ChevronUpIcon, RefreshCcw } from "lucide-react";
import { useChatContext } from "@/components/chat/provider";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils/helpers";
import { ModelItem } from "@/components/chat/model-picker";

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
  const { reload, availableModels } = useChatContext();
  const dropdown = useDropdown();

  const isShown = controlledIsShown ?? dropdown.isShown;
  const close = onClose ?? dropdown.close;
  const triggerProps = onToggle
    ? { onClick: onToggle }
    : dropdown.getDropdownTriggerProps();

  return (
    <div className="flex items-center gap-3 relative text-zinc-700 dark:text-zinc-200">
      <div
        onClick={() => reload()}
        className="cursor-pointer hover:text-zinc-900 dark:hover:text-white transition-colors"
      >
        <RefreshCcw size={18} />
      </div>
      <div className="w-[1px] h-4 bg-zinc-300 dark:bg-zinc-700"></div>
      <div
        {...triggerProps}
        className="flex items-center gap-2 font-bold text-sm text-zinc-500 dark:text-zinc-400 cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors break-words [overflow-wrap:anywhere]"
      >
        Retry with
        <ChevronUpIcon
          size={16}
          className={cn(
            "transition-transform duration-300",
            isShown ? "rotate-0" : "rotate-180",
          )}
        />
      </div>
      <Dropdown.Popup
        isShown={isShown}
        close={close}
        className="max-h-[400px] lg:max-h-[600px] overflow-auto scrollbar-none"
        variant="responsive-center"
      >
        {availableModels.map((model) => (
          <Dropdown.Item
            key={model}
            className="px-0 py-0 first:py-0 last:py-0"
            onClick={() => {
              reload({ selectedModel: model });
              close();
            }}
          >
            <ModelItem name={model} />
          </Dropdown.Item>
        ))}
      </Dropdown.Popup>
    </div>
  );
};
