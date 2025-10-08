/* eslint-disable react-hooks/rules-of-hooks */
import { test as base } from "@playwright/test";
import type { DefaultJWT } from "next-auth/jwt";
import { TEST_USER_EMAIL, TEST_USER_ID } from "@/tests/e2e/db-seed";

interface TestFixtures {
  authenticatedUser: { id: string; email: string };
}

/**
 * Extended test with fixtures for AI providers and database
 * This allows dependency injection for testing
 */
export const test = base.extend<TestFixtures>({
  authenticatedUser: async ({ page, baseURL }, use) => {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      throw new Error("AUTH_SECRET not set");
    }

    const token: DefaultJWT = {
      id: TEST_USER_ID,
      email: TEST_USER_EMAIL,
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
    await use({ id: TEST_USER_ID, email: TEST_USER_EMAIL });
  },
});

export { expect } from "@playwright/test";
