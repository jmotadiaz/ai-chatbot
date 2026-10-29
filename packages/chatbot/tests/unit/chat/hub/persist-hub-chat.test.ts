import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { setupTestDb } from "../../../helpers/db-setup";
import { sessionFor } from "../../../helpers/session-fixture";
import { getDb } from "@/lib/infrastructure/db/db";
import { chat, message, user } from "@/lib/infrastructure/db/schema";
import { getMessagesByChatId } from "@/lib/features/chat/queries";
import type { ChatbotMessage } from "@/lib/features/chat/types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/features/auth/cached-auth", () => ({
  getSession: vi.fn(),
}));
vi.mock("@/lib/features/chat/title", () => ({
  generateTitle: vi.fn(async () => "Hub transcript title"),
}));

const { getSession } = await import("@/lib/features/auth/cached-auth");
const { generateTitle } = await import("@/lib/features/chat/title");
const { persistHubChatFromTranscript } = await import(
  "@/lib/features/chat/hub/actions"
);

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(() => {
  vi.mocked(getSession).mockReset();
  vi.mocked(generateTitle).mockClear();
});

const createUser = async () => {
  const [row] = await getDb()
    .insert(user)
    .values({ email: `hub-${crypto.randomUUID().slice(0, 8)}@test.local` })
    .returning();
  return row!.id;
};

const transcript: ChatbotMessage[] = [
  {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text: "first question" }],
  },
  {
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [{ type: "text", text: "first answer" }],
  },
  {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text: "follow up" }],
  },
];

describe("persistHubChatFromTranscript", () => {
  it("saves a root chat with its transcript in order", async () => {
    const userId = await createUser();
    vi.mocked(getSession).mockResolvedValue(sessionFor(userId));
    const chatId = crypto.randomUUID();

    const result = await persistHubChatFromTranscript({
      chatId,
      messages: transcript,
      model: "basicChat",
    });

    expect(result).toEqual({ chatId });
    expect(generateTitle).toHaveBeenCalledWith(transcript);

    const [saved] = await getDb().select().from(chat).where(eq(chat.id, chatId));
    expect(saved).toMatchObject({
      userId,
      title: "Hub transcript title",
      projectId: null,
      defaultModel: "basicChat",
    });

    const savedMessages = await getMessagesByChatId(chatId);
    expect(savedMessages.map((m) => m.id)).toEqual(
      transcript.map((m) => m.id),
    );
    expect(savedMessages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
  });

  it("writes nothing when there is no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const chatId = crypto.randomUUID();

    await expect(
      persistHubChatFromTranscript({
        chatId,
        messages: transcript,
        model: "basicChat",
      }),
    ).rejects.toThrow("Unauthorized");

    expect(generateTitle).not.toHaveBeenCalled();
    const rows = await getDb().select().from(chat).where(eq(chat.id, chatId));
    expect(rows).toHaveLength(0);
    const messages = await getDb()
      .select()
      .from(message)
      .where(eq(message.chatId, chatId));
    expect(messages).toHaveLength(0);
  });
});
