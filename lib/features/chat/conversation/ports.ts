import type {
  Chat,
  Message,
  InsertMessage,
  InsertChat,
} from "@/lib/infrastructure/db/schema";
import type { Project } from "@/lib/features/project/types";
import { Transactional } from "@/lib/infrastructure/db/queries";
import type { ModelConfiguration } from "@/lib/features/foundation-model/types";

export interface ChatDbPort<Tx = unknown> {
  transaction<
    T extends readonly [Transactional<unknown>, ...Transactional<unknown>[]],
  >(
    ...fns: T
  ): Promise<{
    [K in keyof T]: T[K] extends Transactional<infer U> ? U : never;
  }>;
  saveChat(chat: InsertChat): (tx: Tx) => Promise<Chat>;
  updateChat(
    filter: { id: string; userId: string },
    partialChat: Partial<
      Pick<
        Chat,
        | "defaultModel"
        | "title"
        | "agent"
        | "defaultTemperature"
        | "defaultTopP"
        | "defaultTopK"
        | "webSearchNumResults"
        | "ragMaxResources"
        | "minRagResourcesScore"
        | "tools"
        | "projectId"
        | "pinned"
        | "updatedAt"
      >
    >,
  ): (tx: Tx) => Promise<Chat>;
  saveMessages(messages: InsertMessage[]): (tx: Tx) => Promise<Message[]>;
  deleteMessageById(id?: string): (tx: Tx) => Promise<Message | undefined>;
  getChatById(filter: {
    id: string;
    userId: string;
  }): Promise<Chat | undefined>;
  getChats(filter: {
    userId: string;
    limit: number;
    projectId?: string | null;
  }): Promise<{ chats: Chat[] }>;
  deleteChat(filter: {
    id: string;
    userId: string;
  }): (tx: Tx) => Promise<Chat | undefined>;
  getMessagesByChatId(id: string): Promise<Message[]>;
}

export interface ChatAgentAiPort {
  getRagModelConfiguration(): ModelConfiguration;
  getWebSearchModelConfiguration(): ModelConfiguration;
  getContext7ModelConfiguration(): ModelConfiguration;
  getProjectModelConfiguration(): ModelConfiguration;
}

export interface ProjectPort {
  getProjectById(filter: {
    id: string;
    userId: string;
  }): Promise<Project | undefined>;
}
