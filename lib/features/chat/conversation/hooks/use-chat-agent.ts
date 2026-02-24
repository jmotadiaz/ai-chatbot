"use client";

import { useState } from "react";
import type { Agent } from "@/lib/features/chat/types";

export interface UseChatAgentResult {
  agent: Agent;
  setAgent: (agent: Agent) => void;
}

export const useChatAgent = (
  initialAgent: Agent = "rag",
): UseChatAgentResult => {
  const [agent, setAgent] = useState<Agent>(initialAgent);

  return {
    agent,
    setAgent,
  };
};
