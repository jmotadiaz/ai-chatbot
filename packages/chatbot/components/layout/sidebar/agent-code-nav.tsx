import { Code } from "lucide-react";
import ChatLink from "@/components/chat/link";
import { Item } from "@/components/ui/item";

export const AgentCodeNav: React.FC = () => {
  if (process.env.CODING_AGENT_ENABLED !== "true") {
    return null;
  }

  return (
    <ChatLink href="/agent/code">
      <Item>
        <Code size={18} />
        Code
      </Item>
    </ChatLink>
  );
};
