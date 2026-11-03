/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommentChip } from "@/components/code/file-browser/comment-chip";
import type {
  FilePendingComment,
  ResponsePendingComment,
} from "@/components/code/file-browser/types";

afterEach(cleanup);

describe("CommentChip", () => {
  it("renders a file comment with basename and line number", () => {
    const fileComment: FilePendingComment = {
      id: "c1",
      file: "src/components/button.tsx",
      startLine: 14,
      endLine: 14,
      lineText: "export const Button = () => {}",
      text: "use memo here",
      createdAt: 1,
    };
    const onRemove = vi.fn();

    render(<CommentChip comment={fileComment} onRemove={onRemove} />);

    expect(screen.getByText("button.tsx:14")).toBeDefined();
    expect(screen.getByText("use memo here")).toBeDefined();

    const removeBtn = screen.getByLabelText(
      "Remove comment on src/components/button.tsx line 14",
    );
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("renders a single-line response comment with turn number and line", () => {
    const responseComment: ResponsePendingComment = {
      id: "rc1",
      kind: "response",
      messageId: "a-1",
      turnNumber: 3,
      startLine: 7,
      endLine: 7,
      lineText: "const value = calculate();",
      text: "simplifica esta llamada",
      createdAt: 1,
    };

    render(<CommentChip comment={responseComment} onRemove={vi.fn()} />);

    expect(screen.getByText("Response 3 · L7")).toBeDefined();
    expect(screen.getByText("simplifica esta llamada")).toBeDefined();
    expect(
      screen.getByLabelText("Remove comment on Response 3 line 7"),
    ).toBeDefined();
  });

  it("renders a multi-line range response comment with en-dash", () => {
    const responseComment: ResponsePendingComment = {
      id: "rc2",
      kind: "response",
      messageId: "a-2",
      turnNumber: 1,
      startLine: 12,
      endLine: 15,
      lineText: "line 12\nline 13\nline 14\nline 15",
      text: "extrae a función",
      createdAt: 1,
    };

    render(<CommentChip comment={responseComment} onRemove={vi.fn()} />);

    expect(screen.getByText("Response 1 · L12–15")).toBeDefined();
  });
});
