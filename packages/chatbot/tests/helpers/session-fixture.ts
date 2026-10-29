import type { Session } from "next-auth";

export const sessionFor = (userId: string): Session => ({
  user: { id: userId, type: "regular" },
  expires: "2099-01-01T00:00:00.000Z",
});
