import { randomUUID } from "crypto"
import type { DefaultJWT } from "next-auth/jwt"
import { hashSync } from "bcrypt-ts"
import { eq } from "drizzle-orm"
import { user } from "@/lib/infrastructure/db/schema"
import { getDb } from "@/lib/infrastructure/db/db"

export async function createTestUser(): Promise<{
  id: string
  email: string
  cookie: string
}> {
  const db = getDb()
  const email = `eval-${randomUUID().slice(0, 8)}@test.com`
  const hashedPassword = hashSync("test-password", 1)

  const [newUser] = await db
    .insert(user)
    .values({ email, password: hashedPassword })
    .returning()

  const secret = process.env.AUTH_SECRET ?? "test-auth-secret-change-me"
  const token: DefaultJWT = {
    id: newUser.id,
    email: newUser.email,
    type: "regular",
  }

  const { encode } = await import("next-auth/jwt")
  const cookieName = "authjs.session-token"
  const encodedToken = await encode({ token, secret, salt: cookieName })

  return {
    id: newUser.id,
    email: newUser.email,
    cookie: `${cookieName}=${encodedToken}`,
  }
}

export async function deleteTestUser(userId: string): Promise<void> {
  const db = getDb()
  await db.delete(user).where(eq(user.id, userId))
}
