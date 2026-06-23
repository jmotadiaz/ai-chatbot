"use client";

import type * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  ProjectOverview,
  type ProjectOverviewSize,
} from "@/components/project/overview";
import { LogoIcon } from "@/components/ui/icons";

export interface ChatbotProjectOverviewProps {
  title?: string;
  description?: string;
  className?: string;
  size?: ProjectOverviewSize;
}

export const ChatbotProjectOverview: React.FC<
  ChatbotProjectOverviewProps
> = ({ title, description, className, size = "default" }) => {
  const searchParams = useSearchParams();
  const isTemporaryChat = searchParams.get("chatType") === "temporary";

  return (
    <ProjectOverview.Container className={className}>
      <ProjectOverview.Title size={size}>
        {title ? (
          <span>{title}</span>
        ) : (
          <>
            <LogoIcon className="mr-1" strokeWidth={2} size={42} />
            <span>Chatbot</span>
          </>
        )}
        {description && (
          <ProjectOverview.Subtitle size={size}>
            {description}
          </ProjectOverview.Subtitle>
        )}
        {isTemporaryChat && (
          <ProjectOverview.Subtitle size={size}>
            Temporary chat
          </ProjectOverview.Subtitle>
        )}
      </ProjectOverview.Title>
    </ProjectOverview.Container>
  );
};
