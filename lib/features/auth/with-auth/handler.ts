import type { User } from "next-auth";
import type { UserType } from "@/lib/features/auth/auth-config";
import { getSession } from "@/lib/features/auth/cached-auth";

type Handler = (request: Request) => Promise<Response>;
type AuthenticatedHandler = (
  user: {
    id: string;
    type: UserType;
  } & User,
  request: Request,
) => Promise<Response>;

export function withAuth(handler: AuthenticatedHandler): Handler {
  return async (request) => {
    const session = await getSession();
    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    return await handler(session.user, request);
  };
}
