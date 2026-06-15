import { NextResponse } from "next/server";
import { withAuth } from "@/lib/features/auth/with-auth/handler";
import {
  getCodingAgentSessions,
  createCodingAgentSession,
} from "@/lib/features/agent-code/actions";

function getProjectFromUrl(url: URL): string {
  const parts = url.pathname.split("/");
  // /api/agent/code/[project]/sessions
  return decodeURIComponent(parts[parts.length - 2] ?? "");
}

export const GET = withAuth(async (user, req: Request) => {
  const project = getProjectFromUrl(new URL(req.url));
  const sessions = await getCodingAgentSessions(project);
  return NextResponse.json({ sessions });
});

export const POST = withAuth(async (user, req: Request) => {
  const project = getProjectFromUrl(new URL(req.url));
  const { modelId } = await req.json();
  const session = await createCodingAgentSession(project, modelId);
  return NextResponse.json(session);
});
