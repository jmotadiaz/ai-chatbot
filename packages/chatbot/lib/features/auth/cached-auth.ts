import { cache } from "react";
import { auth } from "./auth-config";

/**
 * Cached version of the auth session to deduplicate calls within the same request.
 * Follows Vercel React Best Practices for request deduplication in Server Components and Actions.
 */
export const getSession = cache(async () => {
  return await auth();
});
