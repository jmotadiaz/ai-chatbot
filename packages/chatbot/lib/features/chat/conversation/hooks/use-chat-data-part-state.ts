"use client";

import { useState } from "react";
import type { DataUIPart } from "ai";
import type { ChatbotDataPart } from "@/lib/features/chat/types";

export interface ChatDataPartState {
  dataPart: DataUIPart<ChatbotDataPart> | undefined;
  setDataPart: React.Dispatch<
    React.SetStateAction<DataUIPart<ChatbotDataPart> | undefined>
  >;
}

export const useChatDataPartState = (): ChatDataPartState => {
  const [dataPart, setDataPart] = useState<DataUIPart<ChatbotDataPart>>();
  return { dataPart, setDataPart };
};


