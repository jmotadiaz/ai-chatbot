// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ToolCallGroup } from "@/components/agent-code/tool-call-group";
import type { ToolCallGroup as Group } from "@/lib/features/agent-code/types";

const base: Group = {
  id: "t1",
  name: "bash",
  args: '{"command":"ls -la"}',
  argsParsed: { command: "ls -la" },
  status: "ok",
  startedAt: 0,
  finishedAt: 400,
  summary: "ls -la",
};

describe("ToolCallGroup", () => {
  it("renders running state with spinner", () => {
    const { container } = render(<ToolCallGroup group={{ ...base, status: "running" }} />);
    expect(container).toMatchSnapshot();
  });

  it("renders ok state with check and duration", () => {
    const { container } = render(<ToolCallGroup group={{ ...base, result: "a.txt" }} />);
    expect(container).toMatchSnapshot();
  });

  it("renders error state with x", () => {
    const { container } = render(
      <ToolCallGroup group={{ ...base, status: "error", result: "exit 1" }} />,
    );
    expect(container).toMatchSnapshot();
  });

  it("clamps long output to 20 lines and shows toggle", () => {
    const long = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const { getByText } = render(
      <ToolCallGroup group={{ ...base, result: long }} />,
    );
    expect(getByText("Show more")).toBeDefined();
  });
});
