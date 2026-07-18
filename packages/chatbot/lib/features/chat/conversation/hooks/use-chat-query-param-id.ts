"use client";

import { useQueryState } from "nuqs";
import { validate } from "uuid";

export interface UseChatQueryParamIdResult {
  queryParamChatId: string | null;
  setQueryParamChatId: ReturnType<typeof useQueryState<string | null>>[1];
  validQueryParamChatId: string | undefined;
}

export const useChatQueryParamId = (): UseChatQueryParamIdResult => {
  const [queryParamChatId, setQueryParamChatId] = useQueryState("chatId");
  const validQueryParamChatId =
    queryParamChatId && validate(queryParamChatId) ? queryParamChatId : undefined;

  return { queryParamChatId, setQueryParamChatId, validQueryParamChatId };
};


