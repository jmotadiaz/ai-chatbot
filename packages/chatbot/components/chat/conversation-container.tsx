"use client";

import type { ReactNode, Ref } from "react";
import React from "react";
import { cn } from "@/lib/utils/helpers";

export interface ConversationContainerProps {
  children: ReactNode;
  className?: string;
}

export const ConversationContainer: React.FC<ConversationContainerProps> = ({
  children,
  className,
}) => {
  return (
    <div className={cn("w-full relative overflow-y-hidden", className)}>
      {children}
    </div>
  );
};

export interface ConversationBodyProps {
  children: ReactNode;
  bodyRef?: Ref<HTMLDivElement>;
  className?: string;
}

export const ConversationBody: React.FC<ConversationBodyProps> = ({
  children,
  bodyRef,
  className,
}) => {
  return (
    <div
      ref={bodyRef}
      className={cn("w-full", "h-full overflow-y-auto", className)}
    >
      {children}
    </div>
  );
};
