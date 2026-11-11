import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOOL_PRUNING_CONFIG,
  MIN_TRUNCATION_CHARS,
} from "../../../src/pruning/config";
import { pruningEligibilityFor, toolPolicyFor } from "../../../src/pruning/cooling-window";
import { configWith } from "./fixtures";

const eligible = (toolName: string, chars: number, extra: Partial<{ isError: boolean; hasImages: boolean }> = {}) =>
  pruningEligibilityFor({ toolName, chars, isError: false, ...extra });

describe("toolPolicyFor", () => {
  it("treats pure reads as exploratory", () => {
    for (const toolName of ["read", "grep", "find", "ls"]) {
      expect(toolPolicyFor(toolName)).toEqual({
        category: "exploratory",
        allowsDropResult: true,
        allowsDropCall: true,
      });
    }
  });

  it("never lets an execution call be dropped, only its result", () => {
    expect(toolPolicyFor("bash")).toEqual({
      category: "execution",
      allowsDropResult: true,
      allowsDropCall: false,
    });
  });

  it("denies mutations, delegation, publishing and every unknown tool", () => {
    for (const toolName of [
      "edit",
      "write",
      "subagent",
      "publish_artifact",
      "webfetch",
      "Read",
      "",
    ]) {
      expect(toolPolicyFor(toolName)).toEqual({
        category: "mutating",
        allowsDropResult: false,
        allowsDropCall: false,
      });
    }
  });
});

describe("pruningEligibilityFor", () => {
  it("allows both drops for a long exploratory result", () => {
    expect(eligible("grep", 8_000)).toEqual({
      dropResult: true,
      dropCall: true,
      requiresSupersessionOrJudge: false,
    });
  });

  it("never stubs a result at or below the minimum truncation size", () => {
    expect(eligible("read", MIN_TRUNCATION_CHARS).dropResult).toBe(false);
    expect(eligible("read", MIN_TRUNCATION_CHARS + 1).dropResult).toBe(true);
  });

  it("still allows dropping the call of a short exploratory result", () => {
    expect(eligible("read", 100)).toEqual({
      dropResult: false,
      dropCall: true,
      requiresSupersessionOrJudge: false,
    });
  });

  it("treats an image result as truncatable however short its text is", () => {
    expect(eligible("read", 10, { hasImages: true }).dropResult).toBe(true);
  });

  it("limits bash to drop_result", () => {
    expect(eligible("bash", 8_000)).toEqual({
      dropResult: true,
      dropCall: false,
      requiresSupersessionOrJudge: false,
    });
  });

  it("keeps short bash output and every mutation result", () => {
    expect(eligible("bash", 100)).toEqual({
      dropResult: false,
      dropCall: false,
      requiresSupersessionOrJudge: false,
    });
    for (const toolName of ["edit", "write", "subagent", "publish_artifact", "unknown"]) {
      expect(eligible(toolName, 100_000)).toEqual({
        dropResult: false,
        dropCall: false,
        requiresSupersessionOrJudge: false,
      });
    }
  });

  it("forces keep on short errors", () => {
    expect(eligible("read", DEFAULT_TOOL_PRUNING_CONFIG.errorTruncateMinChars, { isError: true })).toEqual({
      dropResult: false,
      dropCall: false,
      requiresSupersessionOrJudge: false,
    });
  });

  it("never drops the call of a bulky error, only its body conditionally", () => {
    for (const toolName of ["read", "grep", "find", "ls", "bash"]) {
      expect(eligible(toolName, DEFAULT_TOOL_PRUNING_CONFIG.errorTruncateMinChars + 1, { isError: true })).toEqual({
        dropResult: true,
        dropCall: false,
        requiresSupersessionOrJudge: true,
      });
    }
  });

  it("keeps bulky errors of mutation and unknown tools", () => {
    expect(eligible("edit", 100_000, { isError: true })).toEqual({
      dropResult: false,
      dropCall: false,
      requiresSupersessionOrJudge: false,
    });
  });

  it("applies the char gate to errors even when the result carries images", () => {
    expect(eligible("read", 0, { isError: true, hasImages: true })).toEqual({
      dropResult: false,
      dropCall: false,
      requiresSupersessionOrJudge: false,
    });
  });

  it("honours an overridden error truncation minimum", () => {
    const config = configWith({ errorTruncateMinChars: 100 });

    // 500 chars passes the overridden error gate and the minimum truncation size.
    expect(pruningEligibilityFor({ toolName: "read", isError: true, chars: 500 }, config)).toEqual({
      dropResult: true,
      dropCall: false,
      requiresSupersessionOrJudge: true,
    });
    expect(
      pruningEligibilityFor({ toolName: "read", isError: true, chars: 500 }),
    ).toEqual({ dropResult: false, dropCall: false, requiresSupersessionOrJudge: false });
  });
});
