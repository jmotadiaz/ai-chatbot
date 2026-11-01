"use client";

import { LayoutGrid } from "lucide-react";
import type { ClassValue } from "clsx";
import ChatLink from "@/components/chat/link";
import { Item } from "@/components/ui/item";
import { cn } from "@/lib/utils/helpers";

export interface HubNavProps {
  className?: ClassValue;
}

export const HubNav: React.FC<HubNavProps> = ({ className }) => {
  return (
    <div className={cn(className)}>
      <ChatLink href="/chat/hub">
        <Item>
          <LayoutGrid size={18} />
          Chat Hub
        </Item>
      </ChatLink>
    </div>
  );
};
