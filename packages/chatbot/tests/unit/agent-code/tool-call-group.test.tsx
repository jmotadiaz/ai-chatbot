// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
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

afterEach(cleanup);

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
    const { getByText, container } = render(
      <ToolCallGroup group={{ ...base, result: long }} />,
    );
    expect(getByText("Show more")).toBeDefined();
    const pres = container.querySelectorAll("pre");
    const resultPre = pres[pres.length - 1] as HTMLPreElement | undefined;
    expect(resultPre?.textContent).not.toBeNull();
    expect(resultPre!.textContent!.split("\n")).toHaveLength(20);
  });

  it("expands the clamped output when 'Show more' is clicked", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`);
    const long = lines.join("\n");
    const { getByText, container, queryByText } = render(
      <ToolCallGroup group={{ ...base, result: long }} />,
    );
    const toggle = getByText("Show more");
    fireEvent.click(toggle);
    expect(queryByText("Show more")).toBeNull();
    const pres = container.querySelectorAll("pre");
    const resultPre = pres[pres.length - 1] as HTMLPreElement | undefined;
    expect(resultPre?.textContent).not.toBeNull();
    expect(resultPre!.textContent!.split("\n")).toHaveLength(50);
  });
});
