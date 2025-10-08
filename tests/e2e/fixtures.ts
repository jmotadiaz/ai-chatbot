/* eslint-disable react-hooks/rules-of-hooks */
import { test as base } from "@playwright/test";
import type { DefaultJWT } from "next-auth/jwt";
import { eq } from "drizzle-orm";
import { DB, getDb } from "@/lib/db/db";
import { user } from "@/lib/db/schema";

interface TestFixtures {
  testDb: DB;
  authenticatedUser: { id: string; email: string };
}

/**
 * Extended test with fixtures for AI providers and database
 * This allows dependency injection for testing
 */
export const test = base.extend<TestFixtures>({
  authenticatedUser: async ({ page, baseURL }, use) => {
    const userTest = await getDb().query.user.findFirst({
      where: eq(user.email, "test@test.com"),
    });

    if (!userTest) {
      throw new Error("Test user not found in database");
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      throw new Error("AUTH_SECRET not set");
    }

    const token: DefaultJWT = {
      id: userTest.id,
      email: userTest.email,
      type: "regular",
    };

    const { encode } = await import("next-auth/jwt");
    const cookieName = "authjs.session-token";

    const encodedToken = await encode({
      token,
      secret,
      salt: cookieName,
    });

    // --- Step 3: Set session cookie ---

    // Derive correct domain from baseURL (strip protocol and port)
    const url = new URL(baseURL ?? "http://localhost:3000");
    const domain = url.hostname;

    await page.context().addCookies([
      {
        name: cookieName,
        value: encodedToken,
        domain,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: false,
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 1 week
      },
    ]);

    // Provide the authenticated user to the test
    await use(userTest);
  },
});

export { expect } from "@playwright/test";
