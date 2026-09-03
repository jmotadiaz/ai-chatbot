import { describe, it, expect } from "vitest";
import {
  midTurnBlockReason,
  pendingChipText,
  pendingQueuesOf,
  stringArrayOf,
} from "@/lib/features/code/pending-queues";

describe("pending-queues helpers", () => {
  it("stringArrayOf keeps only strings and reads anything else as empty", () => {
    expect(stringArrayOf(["a", 1, null, "b"])).toEqual(["a", "b"]);
    expect(stringArrayOf(undefined)).toEqual([]);
    expect(stringArrayOf("not-an-array")).toEqual([]);
  });

  it("pendingQueuesOf coerces unknown payloads into owned queues", () => {
    expect(
      pendingQueuesOf({ steering: ["s"], followUp: ["f", 42] }),
    ).toEqual({ steering: ["s"], followUp: ["f"] });
    expect(pendingQueuesOf(null)).toEqual({ steering: [], followUp: [] });
    expect(pendingQueuesOf({})).toEqual({ steering: [], followUp: [] });
  });

  it("pendingChipText prefers the follow-up entry", () => {
    expect(
      pendingChipText({ steering: ["steered"], followUp: ["queued"] }),
    ).toBe("queued");
  });

  it("pendingChipText falls back to steering once promoted", () => {
    // After promotion the follow-up list is empty: the chip keeps showing
    // the steering text instead of disappearing and unlocking the composer.
    expect(pendingChipText({ steering: ["steered"], followUp: [] })).toBe(
      "steered",
    );
  });

  it("pendingChipText reads nothing armed as null, including malformed input", () => {
    expect(pendingChipText({ steering: [], followUp: [] })).toBeNull();
    expect(pendingChipText(null)).toBeNull();
    expect(pendingChipText(undefined)).toBeNull();
    expect(pendingChipText({ steering: "nope" })).toBeNull();
  });

  it("pendingChipText skips blank entries", () => {
    expect(
      pendingChipText({ steering: [], followUp: ["   ", "real text"] }),
    ).toBe("real text");
  });
});

describe("midTurnBlockReason", () => {
  it("passes plain text with nothing pre-armed", () => {
    expect(
      midTurnBlockReason({ skillCount: 0, commentCount: 0, fileCount: 0 }),
    ).toBeNull();
  });

  it("blocks armed skills with a precise error", () => {
    expect(
      midTurnBlockReason({ skillCount: 1, commentCount: 0, fileCount: 0 }),
    ).toMatch(/skills cannot be queued.*plain text only/i);
  });

  it("blocks pending file comments with a precise error", () => {
    expect(
      midTurnBlockReason({ skillCount: 0, commentCount: 2, fileCount: 0 }),
    ).toMatch(/file comments cannot be queued.*plain text only/i);
  });

  it("blocks staged files with a precise error", () => {
    expect(
      midTurnBlockReason({ skillCount: 0, commentCount: 0, fileCount: 3 }),
    ).toMatch(/attachments cannot be queued.*plain text only/i);
  });
});
