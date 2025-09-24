import { ChevronUpIcon } from "lucide-react";
import { useChatContext } from "@/app/providers";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { CHAT_MODELS } from "@/lib/ai/models/definition";
import { ModelItem } from "@/components/model-picker";

export const ChatReload: React.FC = () => {
  const { reload, selectedModel, setConfig } = useChatContext();
  const { isShown, close, getDropdownPopupProps, getDropdownTriggerProps } =
    useDropdown();

  return (
    <div className="relative">
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
        {CHAT_MODELS.filter((model) => model !== selectedModel).map((model) => (
          <Dropdown.Item
            key={model}
            className="px-0 py-0"
            onClick={() => {
              reload({ selectedModel: model });
              setConfig({ selectedModel: model });
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
