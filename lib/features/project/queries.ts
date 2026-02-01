import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/infrastructure/db/db";
import {
  project,
  chat,
  type Chat,
  type Project,
  type InsertProject,
} from "@/lib/infrastructure/db/schema";
import {
  type Transactional,
  type SafeTransaction,
} from "@/lib/infrastructure/db/queries";

export const createProject =
  ({
    userId,
    name,
    defaultModel,
    defaultTemperature,
    defaultTopP,
    defaultTopK,
    systemPrompt,
    hasPromptRefiner,

    webSearchNumResults,
    tools,
    isActive,
  }: InsertProject): Transactional<Project> =>
  (tx) => {
    return tx
      .insert(project)
      .values({
        userId,
        name,
        defaultModel,
        defaultTemperature,
        defaultTopP,
        defaultTopK,
        systemPrompt,
        hasPromptRefiner,

        webSearchNumResults,
        tools,
        isActive,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()
      .then(([newProject]) => newProject);
  };

export async function getProjectById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<Project | undefined> {
  try {
    const [selectedProject] = await getDb()
      .select()
      .from(project)
      .where(and(eq(project.id, id), eq(project.userId, userId)));
    return selectedProject;
  } catch (error) {
    console.error("Failed to get project by id from database", error);
    return undefined;
  }
}

interface GetProjectByUserIdParams {
  userId: string;
  limit?: number;
  offset?: number;
}

export async function getProjectsByUserId(
  params: GetProjectByUserIdParams & { joinChats?: false },
): Promise<Array<Project>>;
export async function getProjectsByUserId(
  params: GetProjectByUserIdParams & { joinChats: true },
): Promise<Array<Project & { chats: Array<Chat> }>>;
export async function getProjectsByUserId({
  userId,
  joinChats = false,
  limit = 50,
  offset = 0,
}: GetProjectByUserIdParams & { joinChats?: boolean }): Promise<
  Array<Project> | Array<Project & { chats: Array<Chat> }>
> {
  try {
    if (joinChats) {
      return await getDb().query.project.findMany({
        where: and(
          eq(project.userId, userId),
          eq(project.isActive, true),
          ne(project.name, ""),
        ),
        with: {
          chats: {
            orderBy: desc(chat.updatedAt),
            limit: 20,
          },
        },
        orderBy: desc(project.updatedAt),
        limit,
        offset,
      });
    } else {
      return await getDb()
        .select()
        .from(project)
        .where(
          and(
            eq(project.userId, userId),
            eq(project.isActive, true),
            ne(project.name, ""),
          ),
        )
        .orderBy(desc(project.updatedAt))
        .limit(limit)
        .offset(offset);
    }
  } catch (error) {
    console.error("Failed to get projects by user id from database");
    throw error;
  }
}

export const updateProject =
  (
    { id, userId }: SafeTransaction,
    updateProjectData: Partial<Omit<InsertProject, "userId">>,
  ): Transactional<Project | undefined> =>
  (tx) => {
    return tx
      .update(project)
      .set({
        ...updateProjectData,
        updatedAt: new Date(),
      })
      .where(and(eq(project.id, id), eq(project.userId, userId)))
      .returning()
      .then(([updatedProject]) => updatedProject);
  };

export const deleteProject =
  ({ id, userId }: SafeTransaction): Transactional<Project | undefined> =>
  (tx) => {
    return tx
      .delete(project)
      .where(and(eq(project.id, id), eq(project.userId, userId)))
      .returning()
      .then(([deletedProject]) => deletedProject);
  };
