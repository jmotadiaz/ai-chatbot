"use client";

import { CodingAgentMarkdownAnchor } from "./coding-agent-markdown-anchor";
import { Response } from "@/components/chat/response";

const COMPONENTS = { a: CodingAgentMarkdownAnchor };

export interface AgentResponseProps {
  children: string;
}

export const AgentResponse: React.FC<AgentResponseProps> = ({ children }) => (
  <Response components={COMPONENTS}>{children}</Response>
);
