"use server";

import { z } from "zod";
import { getHistoryChats } from "./queries";
import { getSession } from "@/lib/features/auth/cached-auth";

const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  filter: z.string().default(""),
});

export async function getHistoryChatsAction({
  limit = 20,
  offset = 0,
  filter = "",
}: {
  limit?: number;
  offset?: number;
  filter?: string;
}) {
  const validated = paginationSchema.parse({ limit, offset, filter });
  const session = await getSession();

  if (!session?.user) {
    return {
      chats: [],
      hasMore: false,
    };
  }

  return getHistoryChats({
    userId: session.user.id,
    limit: validated.limit,
    offset: validated.offset,
    filter: validated.filter,
  });
}
