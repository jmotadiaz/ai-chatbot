import { eq, sql } from "drizzle-orm"
import type { CompactionSnapshot } from "./types"
import { getDb } from "@/lib/infrastructure/db/db"
import { chatSummary } from "@/lib/infrastructure/db/schema"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function createCompactionDetector(chatId: string) {
  let lastSummaryId: string | null = null

  async function poll(): Promise<CompactionSnapshot | null> {
    for (let attempt = 0; attempt < 8; attempt++) {
      if (attempt > 0) await sleep(1500)

      const db = getDb()
      const summaries = await db
        .select()
        .from(chatSummary)
        .where(eq(chatSummary.chatId, chatId))
        .orderBy(sql`${chatSummary.createdAt} ASC`)

      if (summaries.length === 0) continue

      const latest = summaries[summaries.length - 1]
      if (latest.id === lastSummaryId) continue

      lastSummaryId = latest.id

      return {
        triggeredAt: (latest.createdAt as Date).toISOString(),
        messagesBefore: summaries.length,
        tokensBefore: latest.tokensBefore ?? 0,
        summary: latest.summary ?? "",
        modelUsed: latest.modelUsed ?? "unknown",
        summarizedMessageId: latest.messageId ?? "",
      }
    }

    return null
  }

  return { poll }
}
