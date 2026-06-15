import { NextResponse } from "next/server";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { getCodingAgentModels } from "@/lib/features/agent-code/actions";

export const GET = withAuth(async () => {
  const models = await getCodingAgentModels();
  return NextResponse.json({ models });
});
