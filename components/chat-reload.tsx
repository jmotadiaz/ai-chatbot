import { ChevronUpIcon, RefreshCcw } from "lucide-react";
import { useChatContext } from "@/app/(chat)/chat-provider";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils/helpers";
import { ModelItem } from "@/components/model-picker";

export const ChatReload: React.FC = () => {
  const { reload, availableModels } = useChatContext();
  const { isShown, close, getDropdownPopupProps, getDropdownTriggerProps } =
    useDropdown();

  return (
    <div className="flex items-center gap-3 relative text-zinc-700 dark:text-zinc-200">
      <div onClick={() => reload()} className="cursor-pointer">
        <RefreshCcw size={18} />
      </div>
      <div className="w-[2px] h-4 bg-secondary"></div>
      <div
        {...getDropdownTriggerProps()}
        className="flex items-center gap-2 font-bold text-sm select-none cursor-pointer"
      >
        Retry with
        <ChevronUpIcon
          size={16}
          className={cn(
            "transition-transform duration-300",
            isShown ? "rotate-0" : "rotate-180"
          )}
        />
      </div>
      <Dropdown.Popup
        {...getDropdownPopupProps()}
        className="max-h-[400px] lg:max-h-[600px] overflow-auto scrollbar-none"
        variant="center"
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
