import { CodeXml } from "lucide-react";
import { config } from "config";
import ChatLink from "@/components/chat/link";
import { Item } from "@/components/ui/item";

export const AgentCodeNav: React.FC = () => {
  if (!config.codingAgentEnabled()) {
    return null;
  }

  return (
    <ChatLink href="/agent/code">
      <Item>
        <CodeXml size={18} />
        Coding Agent
      </Item>
    </ChatLink>
  );
};
