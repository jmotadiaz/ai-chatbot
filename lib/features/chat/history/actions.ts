"use server";

import { getHistoryChats } from "./queries";
import { auth } from "@/lib/features/auth/auth-config";

export async function getHistoryChatsAction({
  limit = 20,
  offset = 0,
  filter = "",
}: {
  limit?: number;
  offset?: number;
  filter?: string;
}) {
  const session = await auth();

  if (!session?.user) {
    return {
      chats: [],
      hasMore: false,
    };
  }

  return getHistoryChats({
    userId: session.user.id,
    limit,
    offset,
    filter,
  });
}
