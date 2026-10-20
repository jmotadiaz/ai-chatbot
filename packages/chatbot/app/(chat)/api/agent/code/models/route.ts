import { NextResponse } from "next/server";
import type { ThinkingLevel } from "@/lib/features/foundation-model/config";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { getCodingAgentModels } from "@/lib/features/code/actions";

export const GET = withAuth(async () => {
  const models: Array<{ id: string; levels: ThinkingLevel[] }> =
    await getCodingAgentModels();
  return NextResponse.json({ models });
});
