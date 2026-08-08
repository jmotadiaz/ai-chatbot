import { NextResponse } from "next/server";
import type { InvocableModelId, ThinkingLevel } from "models";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { getCodingAgentModels } from "@/lib/features/code/actions";

export const GET = withAuth(async () => {
  const models: Array<{ id: InvocableModelId; levels: ThinkingLevel[] }> =
    await getCodingAgentModels();
  return NextResponse.json({ models });
});
