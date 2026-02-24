//
import {
  saveChat as dbSaveChat,
  updateChat as dbUpdateChat,
  saveMessages as dbSaveMessages,
  deleteMessageById as dbDeleteMessageById,
  getChatById as dbGetChatById,
  getChats as dbGetChats,
  deleteChat as dbDeleteChat,
  getMessagesByChatId as dbGetMessagesByChatId,
} from "@/lib/features/chat/queries";
import { ChatDbPort } from "@/lib/features/chat/conversation/ports";

import { transaction as dbTransaction } from "@/lib/infrastructure/db/queries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const chatDbAdapter: ChatDbPort<any> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction: dbTransaction as any,
  saveChat: dbSaveChat,
  updateChat: dbUpdateChat,
  saveMessages: dbSaveMessages,
  deleteMessageById: dbDeleteMessageById,
  getChatById: dbGetChatById,
  getChats: dbGetChats,
  deleteChat: dbDeleteChat,
  getMessagesByChatId: dbGetMessagesByChatId,
};
