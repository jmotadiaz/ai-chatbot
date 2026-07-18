"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createCodingAgentSession } from "@/lib/features/code/actions";

export interface UseCreateCodingAgentSessionArgs {
  project: string;
  modelId?: string;
}

export interface UseCreateCodingAgentSessionResult {
  isCreatingSession: boolean;
  createNewSession: () => Promise<void>;
}

export function useCreateCodingAgentSession({
  project,
  modelId,
}: UseCreateCodingAgentSessionArgs): UseCreateCodingAgentSessionResult {
  const router = useRouter();
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const createNewSession = async () => {
    if (isCreatingSession) return;

    setIsCreatingSession(true);
    try {
      const session = await createCodingAgentSession(
        project,
        modelId || undefined,
      );
      router.push(
        `/agent/code/${encodeURIComponent(project)}/${session.sessionId}`,
      );
    } catch {
      toast.error("Failed to create coding agent session");
    } finally {
      setIsCreatingSession(false);
    }
  };

  return {
    isCreatingSession,
    createNewSession,
  };
}
