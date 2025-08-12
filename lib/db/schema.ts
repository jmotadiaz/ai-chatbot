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
  title: varchar("title", { length: 255 }),
  defaultModel: varchar("defaultModel", { length: 100 }),
  defaultTemperature: real("defaultTemperature"),
  defaultTopP: real("defaultTopP"),
  defaultTopK: real("defaultTopK"),
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
  attachments: json("attachments").notNull(),
  serial: serial("serial").unique(),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const resources = pgTable("resources", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    resourceId: uuid("resourceId")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
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
  resources: many(resources),
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

export const resourcesRelations = relations(resources, ({ many, one }) => ({
  user: one(user, {
    fields: [resources.userId],
    references: [user.id],
  }),
  embeddings: many(embeddings),
}));

export const embeddingsRelations = relations(embeddings, ({ one }) => ({
  resource: one(resources, {
    fields: [embeddings.resourceId],
    references: [resources.id],
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
export type Resource = InferSelectModel<typeof resources>;
export type InsertResource = Omit<
  InferInsertModel<typeof resources>,
  "createdAt" | "updatedAt" | "id"
>;
export type Embedding = InferSelectModel<typeof embeddings>;
export type InsertEmbedding = Omit<InferInsertModel<typeof embeddings>, "id">;
