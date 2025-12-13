import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  json,
  timestamp,
  real,
  text,
  vector,
  index,
  serial,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const project = pgTable("Project", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  defaultModel: varchar("defaultModel", { length: 100 }),
  defaultTemperature: real("defaultTemperature"),
  defaultTopP: real("defaultTopP"),
  defaultTopK: real("defaultTopK"),
  ragMaxResources: integer("ragMaxResources"),
  webSearchNumResults: integer("webSearchNumResults"),
  systemPrompt: text("systemPrompt").notNull(),
  hasPromptRefiner: boolean("hasMetaPrompt").default(false).notNull(),
  tools: varchar("tools", { length: 100 }).array(),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  projectId: uuid("projectId").references(() => project.id, {
    onDelete: "cascade",
  }),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title"),
  defaultModel: varchar("defaultModel", { length: 100 }),
  defaultTemperature: real("defaultTemperature"),
  defaultTopP: real("defaultTopP"),
  defaultTopK: real("defaultTopK"),
  ragMaxResources: integer("ragMaxResources"),
  webSearchNumResults: integer("webSearchNumResults"),
  tools: varchar("tools", { length: 100 }).array(),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const message = pgTable("Message", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 50 }).notNull(),
  parts: json("parts").notNull(),
  metadata: json("metadata"),
  serial: serial("serial").unique(),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const resource = pgTable("Resource", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: varchar("url", { length: 255 }),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const chunk = pgTable("Chunk", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  resourceId: uuid("resourceId")
    .notNull()
    .references(() => resource.id, { onDelete: "cascade" }),
  content: text("content").notNull(), // Stores the parent content
  type: varchar("type", { length: 50 }).notNull(), // 'text' or 'code'
  language: varchar("language", { length: 50 }),
  boundaryType: varchar("boundaryType", { length: 50 }),
  boundaryName: text("boundaryName"),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const embedding = pgTable(
  "Embedding",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    chunkId: uuid("chunkId")
      .notNull()
      .references(() => chunk.id, { onDelete: "cascade" }),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    embeddingIndex: index("embeddingIndex").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
  })
);

export const projectRelations = relations(project, ({ many }) => ({
  chats: many(chat),
}));

export const userRelations = relations(user, ({ many }) => ({
  resources: many(resource),
}));

export const chatRelations = relations(chat, ({ one, many }) => ({
  project: one(project, {
    fields: [chat.projectId],
    references: [project.id],
  }),
  messages: many(message),
}));

export const messageRelations = relations(message, ({ one }) => ({
  chat: one(chat, {
    fields: [message.chatId],
    references: [chat.id],
  }),
}));

export const resourceRelations = relations(resource, ({ many, one }) => ({
  user: one(user, {
    fields: [resource.userId],
    references: [user.id],
  }),
  chunks: many(chunk),
}));

export const chunkRelations = relations(chunk, ({ one, many }) => ({
  resource: one(resource, {
    fields: [chunk.resourceId],
    references: [resource.id],
  }),
  embeddings: many(embedding),
}));

export const embeddingRelations = relations(embedding, ({ one }) => ({
  chunk: one(chunk, {
    fields: [embedding.chunkId],
    references: [chunk.id],
  }),
}));

export type User = InferSelectModel<typeof user>;
export type Project = InferSelectModel<typeof project>;
export type InsertProject = Omit<
  InferInsertModel<typeof project>,
  "createdAt" | "updatedAt" | "id"
>;
export type Chat = InferSelectModel<typeof chat>;
export type InsertChat = Omit<
  InferInsertModel<typeof chat>,
  "createdAt" | "updatedAt" | "projectId"
> & {
  projectId?: string;
};
export type Message = InferSelectModel<typeof message>;
export type InsertMessage = Omit<
  InferInsertModel<typeof message>,
  "createdAt" | "serial"
>;
export type Resource = InferSelectModel<typeof resource>;
export type InsertResource = Omit<
  InferInsertModel<typeof resource>,
  "createdAt" | "updatedAt" | "id"
>;

export type Chunk = InferSelectModel<typeof chunk>;
export type InsertChunk = Omit<
  InferInsertModel<typeof chunk>,
  "createdAt" | "updatedAt"
>;

export type Embedding = InferSelectModel<typeof embedding>;
export type InsertEmbedding = Omit<
  InferInsertModel<typeof embedding>,
  "createdAt" | "id"
>;
