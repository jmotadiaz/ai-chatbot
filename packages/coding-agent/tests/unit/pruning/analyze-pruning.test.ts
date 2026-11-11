import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  analyzeSessionFile,
  buildAggregateReport,
} from "../../../scripts/analyze-tool-pruning";
import { TOOL_PRUNING_ENTRY_TYPE, type ToolPruningEpochEntry } from "../../../src/pruning/config";

describe("analyze-tool-pruning", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  function writeSessionTranscript(lines: unknown[]): string {
    const dir = mkdtempSync(path.join(tmpdir(), "tp-analyze-"));
    tempDirs.push(dir);
    const file = path.join(dir, "2026-11-11_session-test.jsonl");
    writeFileSync(
      file,
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
      "utf8",
    );
    return file;
  }

  it("computes watermark progression, noul histograms, regrets and missed drops on the active branch", () => {
    const epoch1: ToolPruningEpochEntry = {
      version: 1,
      epochId: 1,
      watermark: 0.45,
      timestamp: 1000,
      tokensBefore: 72_000,
      tokensSavedEst: 18_000,
      decisions: {
        "call-read-1": "drop_result",
        "call-read-edited": "drop_result",
      },
      stats: {
        deterministicDrops: 0,
        judgeDrops: 2,
        candidatesEvaluated: 3,
        batches: 1,
        latencyMs: 420,
        decisionModel: "decision-default",
        cost: 0.00025,
      },
      audit: [
        {
          toolCallId: "call-read-1",
          toolName: "read",
          target: "src/regret.ts",
          tokensEst: 8_000,
          resultTokens: 7_950,
          isError: false,
          source: "judge",
          decision: "drop_result",
          keepResult: 0.18,
          keepCall: 0.45,
        },
        {
          toolCallId: "call-read-edited",
          toolName: "read",
          target: "src/edited.ts",
          tokensEst: 10_000,
          resultTokens: 9_950,
          isError: false,
          source: "judge",
          decision: "drop_result",
          keepResult: 0.1,
          keepCall: 0.3,
        },
        {
          toolCallId: "call-bash-missed",
          toolName: "bash",
          target: "pnpm test:old",
          tokensEst: 5_000,
          resultTokens: 4_950,
          isError: false,
          source: "judge",
          decision: "keep",
          keepResult: 0.32,
        },
      ],
    };

    // Abandoned branch epoch (should be ignored because leaf is on the main branch).
    const abandonedEpoch: ToolPruningEpochEntry = {
      version: 1,
      epochId: 99,
      watermark: 0.75,
      timestamp: 2000,
      tokensBefore: 120_000,
      tokensSavedEst: 50_000,
      decisions: { "call-read-1": "drop_call" },
      stats: {
        deterministicDrops: 1,
        judgeDrops: 0,
        candidatesEvaluated: 1,
        batches: 0,
        latencyMs: 1,
      },
    };

    const file = writeSessionTranscript([
      {
        type: "session",
        id: "sess-abc-123",
        timestamp: "2026-11-11T10:00:00.000Z",
        cwd: "/repo",
      },
      {
        type: "message",
        id: "m1",
        parentId: null,
        message: { role: "user", content: "Turn 1" },
      },
      {
        type: "message",
        id: "m2",
        parentId: "m1",
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", id: "call-read-1", name: "read", arguments: { path: "src/regret.ts" } },
            { type: "toolCall", id: "call-read-edited", name: "read", arguments: { path: "src/edited.ts" } },
            { type: "toolCall", id: "call-bash-missed", name: "bash", arguments: { command: "pnpm test:old" } },
          ],
        },
      },
      {
        type: "message",
        id: "m3",
        parentId: "m2",
        message: { role: "toolResult", toolCallId: "call-read-1", toolName: "read", content: [] },
      },
      {
        type: "message",
        id: "m4",
        parentId: "m3",
        message: { role: "toolResult", toolCallId: "call-read-edited", toolName: "read", content: [] },
      },
      {
        type: "message",
        id: "m5",
        parentId: "m4",
        message: { role: "toolResult", toolCallId: "call-bash-missed", toolName: "bash", content: [] },
      },
      // Abandoned branch off m5:
      {
        type: "custom",
        id: "abandoned-1",
        parentId: "m5",
        customType: TOOL_PRUNING_ENTRY_TYPE,
        data: abandonedEpoch,
      },
      // Active branch continues from m5:
      {
        type: "message",
        id: "m6",
        parentId: "m5",
        message: { role: "user", content: "Turn 2" },
      },
      {
        type: "custom",
        id: "ep1",
        parentId: "m6",
        customType: TOOL_PRUNING_ENTRY_TYPE,
        data: epoch1,
      },
      // In Turn 2: `src/edited.ts` is edited first, then read (NOT regret).
      // `src/regret.ts` is re-read directly without edit (REGRET!).
      {
        type: "message",
        id: "m7",
        parentId: "ep1",
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", id: "call-edit-2", name: "edit", arguments: { path: "src/edited.ts" } },
            { type: "toolCall", id: "call-read-2", name: "read", arguments: { path: "src/edited.ts" } },
            { type: "toolCall", id: "call-reread-regret", name: "read", arguments: { path: "./src/regret.ts" } },
          ],
        },
      },
      {
        type: "message",
        id: "m8",
        parentId: "m7",
        message: { role: "toolResult", toolCallId: "call-edit-2", toolName: "edit", content: [] },
      },
      {
        type: "message",
        id: "m9",
        parentId: "m8",
        message: { role: "toolResult", toolCallId: "call-read-2", toolName: "read", content: [] },
      },
      {
        type: "message",
        id: "m10",
        parentId: "m9",
        message: { role: "toolResult", toolCallId: "call-reread-regret", toolName: "read", content: [] },
      },
    ]);

    const analyzed = analyzeSessionFile(file, "prod");
    expect(analyzed).not.toBeNull();
    const report = buildAggregateReport(
      { since: "2026-11-01", env: "prod", json: true },
      [analyzed!],
    );

    expect(report.totals.sessions).toBe(1);
    expect(report.totals.sessionsWithPruning).toBe(1);
    // Only epoch1 on the active branch is counted; abandonedEpoch (0.75) is ignored.
    expect(report.totals.epochs).toBe(1);
    expect(report.totals.watermarkCounts).toEqual({ "0.45": 1 });
    expect(report.totals.tokensSavedEst).toBe(18_000);
    expect(report.totals.keepResultHistogram).toEqual({
      "[0.00, 0.15)": 1,
      "[0.15, 0.25)": 1,
      "[0.25, 0.40)": 1,
      "[0.40, 0.60)": 0,
      "[0.60, 1.00]": 0,
    });

    // Regret: only `src/regret.ts` (re-read without edit), NOT `src/edited.ts`.
    expect(report.regrets).toHaveLength(1);
    expect(report.regrets[0]).toMatchObject({
      sessionId: "sess-abc-123",
      epochId: 1,
      watermark: 0.45,
      toolCallId: "call-read-1",
      toolName: "read",
      target: "src/regret.ts",
      decision: "drop_result",
      source: "judge",
      keepResult: 0.18,
      turnsUntilRepeat: 0,
    });

    // Missed drop: `pnpm test:old` (5 000 tokens, kept by judge, never used again).
    expect(report.missedDrops).toHaveLength(1);
    expect(report.missedDrops[0]).toMatchObject({
      toolCallId: "call-bash-missed",
      toolName: "bash",
      target: "pnpm test:old",
      tokensEst: 5_000,
      keepResult: 0.32,
    });
  });
});
