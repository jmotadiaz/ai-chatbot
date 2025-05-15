import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Middleware to protect routes and ensure the user is authenticated.
 * Allows access to public routes (login, register), static assets, and API routes.
 * Redirects unauthenticated users to the /login page.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip Next.js internals and static files
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/static/") ||
    pathname.includes(".") // e.g. /favicon.ico, /logo.png
  ) {
    return NextResponse.next();
  }

  // Check for a valid session token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token && pathname !== "/login" && pathname !== "/register") {
    // Redirect to login page with callback URL
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (token && ["/login", "/register"].includes(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

/**
 * Apply this middleware to all routes except API routes
 */
export const config = {
  matcher: ["/((?!api).*)"],
};
