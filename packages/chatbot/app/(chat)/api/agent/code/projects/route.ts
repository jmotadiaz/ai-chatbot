import { NextResponse } from "next/server";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import { getCodingAgentProjects } from "@/lib/features/code/actions";

export const GET = withAuth(async () => {
  const projects = await getCodingAgentProjects();
  return NextResponse.json({ projects });
});
