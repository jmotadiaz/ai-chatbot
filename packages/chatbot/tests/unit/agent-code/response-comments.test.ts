import { describe, expect, it } from "vitest";
import type { Message } from "@ag-ui/client";
import {
  findOrphanedResponseComment,
  responseCommentTargets,
} from "@/lib/features/code/response-comments";
import type { AgentItem } from "@/lib/features/code/types";
import type { ResponsePendingComment } from "@/components/code/file-browser/types";

function user(id: string): AgentItem {
  return {
    kind: "user",
    message: { id, role: "user", content: "request" } as Message,
  };
}

function assistant(id: string, content = "answer"): AgentItem {
  return {
    kind: "assistant",
    message: { id, role: "assistant", content } as Message,
    toolGroups: [],
  };
}

function reasoning(id: string): AgentItem {
  return {
    kind: "reasoning",
    message: { id, role: "reasoning", content: "thinking" } as Message,
  };
}

describe("responseCommentTargets", () => {
  it("enables only the last non-empty assistant message of each completed turn", () => {
    const targets = responseCommentTargets(
      [
        user("u1"),
        assistant("a1-intermediate"),
        reasoning("r1"),
        assistant("a1-final"),
        user("u2"),
        assistant("a2-final"),
      ],
      false,
    );

    expect([...targets.entries()]).toEqual([
      ["a1-final", { turnNumber: 1 }],
      ["a2-final", { turnNumber: 2 }],
    ]);
  });

  it("does not enable the active turn but keeps previous turns available", () => {
    const targets = responseCommentTargets(
      [user("u1"), assistant("a1"), user("u2"), assistant("a2")],
      true,
    );

    expect([...targets.entries()]).toEqual([["a1", { turnNumber: 1 }]]);
  });

  it("ignores empty assistant messages when choosing the final response", () => {
    const targets = responseCommentTargets(
      [user("u1"), assistant("a1"), assistant("a1-tools", "")],
      false,
    );

    expect([...targets.keys()]).toEqual(["a1"]);
  });
});

describe("findOrphanedResponseComment", () => {
  it("returns a response comment whose message no longer exists", () => {
    const orphan: ResponsePendingComment = {
      id: "c1",
      kind: "response",
      messageId: "missing",
      turnNumber: 2,
      startLine: 3,
      endLine: 4,
      lineText: "old response",
      text: "revise this",
      createdAt: 1,
    };

    expect(findOrphanedResponseComment([user("u1"), assistant("a1")], [orphan])).toBe(
      orphan,
    );
    expect(
      findOrphanedResponseComment(
        [user("u1"), assistant("a1")],
        [{ ...orphan, messageId: "a1" }],
      ),
    ).toBeUndefined();
  });
});
