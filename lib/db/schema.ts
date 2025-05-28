import type { InferSelectModel } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  json,
  timestamp,
  real,
  text,
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
  systemPrompt: text("systemPrompt").notNull(),
  metaPrompt: text("metaPrompt"),
  tools: text("tools").array(),
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
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type User = InferSelectModel<typeof user>;
export type Project = InferSelectModel<typeof project>;
export type Chat = InferSelectModel<typeof chat>;
export type Message = InferSelectModel<typeof message>;
