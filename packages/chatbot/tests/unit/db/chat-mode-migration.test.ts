import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { applySqlMigrations } from "../../helpers/db-setup";

/**
 * Migration regression: `0031_lowly_turbo.sql` renames the `agent` enum/column
 * to `chat_mode`/`chatMode` and `0032_enable_auto_chat_mode.sql` adds `auto`,
 * recreating the enum. Both are metadata operations, so every pre-existing
 * Chat must survive with its original mode and the column must end up
 * defaulting to `auto`.
 */
const BEFORE_RENAME = "0030_red_dexter_bennett.sql";
const RENAME = "0031_lowly_turbo.sql";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const LEGACY_CHATS = [
  { id: "22222222-2222-2222-2222-222222222221", mode: "context7" },
  { id: "22222222-2222-2222-2222-222222222222", mode: "rag" },
  { id: "22222222-2222-2222-2222-222222222223", mode: "web" },
] as const;

interface ChatModeRow {
  id: string;
  mode: string;
}

describe("chat_mode enum migrations over existing data", () => {
  let pglite: PGlite;

  beforeAll(async () => {
    pglite = await PGlite.create({ extensions: { vector } });

    // Replay history up to the migration before the rename, then seed rows with
    // the legacy column (`agent`) and its legacy enum values.
    await applySqlMigrations(pglite, { until: BEFORE_RENAME });
    await pglite.exec(
      `INSERT INTO "User" (id, email) VALUES ('${USER_ID}', 'migration@example.com');` +
        LEGACY_CHATS.map(
          ({ id, mode }) =>
            `INSERT INTO "Chat" (id, "userId", title, "agent") VALUES ('${id}', '${USER_ID}', '${mode} chat', '${mode}');`,
        ).join(""),
    );

    await applySqlMigrations(pglite, { from: RENAME });
  });

  afterAll(async () => {
    await pglite.close();
  });

  it("preserves every Chat row and its mode through both migrations", async () => {
    const { rows } = await pglite.query<ChatModeRow>(
      `SELECT id, "chatMode" AS mode FROM "Chat" ORDER BY id`,
    );

    expect(rows).toEqual(LEGACY_CHATS.map(({ id, mode }) => ({ id, mode })));
  });

  it("keeps the pre-existing values in the recreated enum and adds auto", async () => {
    const { rows } = await pglite.query<{ label: string }>(
      `SELECT e.enumlabel AS label
         FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'chat_mode'
        ORDER BY e.enumsortorder`,
    );

    expect(rows.map((row) => row.label)).toEqual([
      "auto",
      "context7",
      "rag",
      "web",
    ]);
  });

  it("defaults new chats to auto", async () => {
    const { rows } = await pglite.query<{ column_default: string | null }>(
      `SELECT column_default
         FROM information_schema.columns
        WHERE table_name = 'Chat' AND column_name = 'chatMode'`,
    );

    expect(rows[0]?.column_default).toBe("'auto'::chat_mode");

    const { rows: inserted } = await pglite.query<{ mode: string }>(
      `INSERT INTO "Chat" (id, "userId", title)
       VALUES ('33333333-3333-3333-3333-333333333333', '${USER_ID}', 'default chat')
       RETURNING "chatMode" AS mode`,
    );

    expect(inserted[0]?.mode).toBe("auto");
  });
});
