import type { InferInsertModel, InferSelectModel, SQL } from "drizzle-orm";
import { relations, sql } from "drizzle-orm";
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
  customType,
  pgEnum,
} from "drizzle-orm/pg-core";

const vectorSearch = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const themeEnum = pgEnum("theme", ["system", "light", "dark"]);
export const agentEnum = pgEnum("agent", ["rag", "web", "context7"]);

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
  theme: themeEnum("theme").default("system").notNull(),
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
  isActive: boolean("isActive").default(true).notNull(),
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
  agent: agentEnum("agent").default("rag").notNull(),
  defaultModel: varchar("defaultModel", { length: 100 }),
  defaultTemperature: real("defaultTemperature"),
  defaultTopP: real("defaultTopP"),
  defaultTopK: real("defaultTopK"),
  ragMaxResources: integer("ragMaxResources"),
  minRagResourcesScore: real("minRagResourcesScore"),
  webSearchNumResults: integer("webSearchNumResults"),
  tools: varchar("tools", { length: 100 }).array(),
  pinned: boolean("pinned").default(false).notNull(),
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
  userId: uuid("userId").references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: varchar("url", { length: 255 }),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const projectResource = pgTable("ProjectResource", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  projectId: uuid("projectId")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  resourceId: uuid("resourceId")
    .notNull()
    .references(() => resource.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const chunk = pgTable(
  "Chunk",
  {
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
    vectorSearch: vectorSearch("vectorSearch")
      .generatedAlwaysAs(
        (): SQL => sql`to_tsvector('english', ${chunk.content})`,
      )
      .notNull(),
  },
  (table) => ({
    vectorSearchIndex: index("vectorSearchIndex").using(
      "gin",
      table.vectorSearch,
    ),
  }),
);

export const userApiKey = pgTable("UserApiKey", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("createdAt", { withTimezone: true })
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
      table.embedding.op("vector_cosine_ops"),
    ),
  }),
);

export const projectRelations = relations(project, ({ many }) => ({
  chats: many(chat),
  projectResources: many(projectResource),
}));

export const userRelations = relations(user, ({ many }) => ({
  resources: many(resource),
  apiKeys: many(userApiKey),
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
  projectResources: many(projectResource),
}));

export const projectResourceRelations = relations(
  projectResource,
  ({ one }) => ({
    project: one(project, {
      fields: [projectResource.projectId],
      references: [project.id],
    }),
    resource: one(resource, {
      fields: [projectResource.resourceId],
      references: [resource.id],
    }),
  }),
);

export const chunkRelations = relations(chunk, ({ one, many }) => ({
  resource: one(resource, {
    fields: [chunk.resourceId],
    references: [resource.id],
  }),
  embeddings: many(embedding),
}));

export const userApiKeyRelations = relations(userApiKey, ({ one }) => ({
  user: one(user, {
    fields: [userApiKey.userId],
    references: [user.id],
  }),
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
  "createdAt" | "updatedAt"
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

export type ProjectResource = InferSelectModel<typeof projectResource>;
export type InsertProjectResource = Omit<
  InferInsertModel<typeof projectResource>,
  "createdAt" | "id"
>;

export type UserApiKey = InferSelectModel<typeof userApiKey>;
export type InsertUserApiKey = Omit<
  InferInsertModel<typeof userApiKey>,
  "createdAt" | "id"
>;
