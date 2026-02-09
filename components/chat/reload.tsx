import { ChevronUpIcon, RefreshCcw, FileSearch, Globe } from "lucide-react";
import { useChatContext } from "@/components/chat/provider";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils/helpers";
import { ModelItem } from "@/components/chat/model-picker";
import { AGENTS, Agent } from "@/lib/features/chat/types";
import { MCPIcon } from "@/components/ui/icons";

const AGENT_LABELS: Record<Agent, string> = {
  rag: "RAG Agent",
  context7: "Ctx7 Agent",
  web: "Web Agent",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AGENT_ICONS: Record<Agent, React.ComponentType<any>> = {
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
  const { reload, availableModels } = useChatContext();
  const modelDropdown = useDropdown();
  const agentDropdown = useDropdown();

  const isModelShown = controlledIsShown ?? modelDropdown.isShown;
  const closeModel = onClose ?? modelDropdown.close;
  const modelTriggerProps = onToggle
    ? { onClick: onToggle }
    : modelDropdown.getDropdownTriggerProps();

  const isAgentShown = agentDropdown.isShown;
  const closeAgent = agentDropdown.close;
  const agentTriggerProps = agentDropdown.getDropdownTriggerProps();

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

      {/* Agent Dropdown */}
      <div className="relative">
        <div
          {...agentTriggerProps}
          className="flex items-center gap-1 font-bold text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors capitalize"
        >
          <span className="whitespace-nowrap">Agent</span>
          <ChevronUpIcon
            size={16}
            className={cn(
              "transition-transform duration-300",
              isAgentShown ? "rotate-0" : "rotate-180",
            )}
          />
        </div>
        <Dropdown.Popup
          isShown={isAgentShown}
          close={closeAgent}
          className="min-w-[150px]"
          variant="responsive-center"
        >
          {AGENTS.map((agentItem) => {
            const AgentIcon = AGENT_ICONS[agentItem];
            return (
              <Dropdown.Item
                key={agentItem}
                onClick={() => {
                  reload({ agent: agentItem });
                  closeAgent();
                }}
                className="capitalize gap-2"
              >
                <AgentIcon size={16} />
                {AGENT_LABELS[agentItem]}
              </Dropdown.Item>
            );
          })}
        </Dropdown.Popup>
      </div>
    </div>
  );
};
