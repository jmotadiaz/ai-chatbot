import type { ComponentType } from "react";
import { FileSearch, Globe, Sparkles } from "lucide-react";
import { MCPIcon } from "@/components/ui/icons";
import type { ChatMode } from "@/lib/features/chat/types";

/**
 * User-facing label of every selectable Chat Mode. Shared by the mode selector
 * and the reload dropdown so both always spell the modes the same way.
 */
export const CHAT_MODE_LABELS: Record<ChatMode, string> = {
  auto: "Auto",
  context7: "Ctx7",
  rag: "RAG",
  web: "Web",
};

/** Icon of every selectable Chat Mode, ordered as `CHAT_MODES`. */
export const CHAT_MODE_ICONS: Record<
  ChatMode,
  ComponentType<{ size?: number }>
> = {
  auto: Sparkles,
  context7: MCPIcon,
  rag: FileSearch,
  web: Globe,
};
