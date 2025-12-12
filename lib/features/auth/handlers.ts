import type { User } from "next-auth";
import type { UserType } from "@/lib/features/auth/auth-config";
import { auth } from "@/lib/features/auth/auth-config";

type Handler = (request: Request) => Promise<Response>;
type AuthenticatedHandler = (
  user: {
    id: string;
    type: UserType;
  } & User,
  request: Request
) => Promise<Response>;

export function withAuth(handler: AuthenticatedHandler): Handler {
  return async (request) => {
    const session = await auth();
    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    return await handler(session.user, request);
  };
}
