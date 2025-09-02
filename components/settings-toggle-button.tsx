"use client";

import { Settings2 } from "lucide-react";
import { useSidebarContext } from "@/app/providers";
import { ChatControl } from "@/components/chat-control";

export const SettingsToggleButton = () => {
  const { toggleSettingsSidebar } = useSidebarContext();

  return (
    <ChatControl
      Icon={Settings2}
      type="button"
      onClick={toggleSettingsSidebar}
    />
  );
};
