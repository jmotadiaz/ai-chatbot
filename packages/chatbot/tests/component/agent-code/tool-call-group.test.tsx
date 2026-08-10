/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ToolCallGroup as Group } from "@/lib/features/code/types";

// SubagentToolLink pulls in the "use server" actions module, whose next-auth
// import does not resolve under vitest. The link is covered separately.
vi.mock("@/lib/features/code/actions", () => ({
  getSubagentSessionAction: vi.fn(async () => ({ error: "not found" })),
}));

const { ToolCallGroup } = await import("@/components/code/tool-call-group");

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

/**
 * The body only mounts once the group is open, so tests must open it.
 * jsdom does not toggle `<details>` from a summary click, so drive the
 * open attribute and dispatch the toggle event React listens for.
 */
const openGroup = (container: HTMLElement) => {
  const details = container.querySelector("details") as HTMLDetailsElement;
  details.open = true;
  fireEvent(details, new Event("toggle"));
};

describe("ToolCallGroup", () => {
  it("renders no args or output while collapsed", () => {
    const { container, queryByText } = render(
      <ToolCallGroup group={{ ...base, result: "some output" }} />,
    );
    expect(queryByText("Args")).toBeNull();
    expect(queryByText("Output")).toBeNull();
    expect(container.querySelectorAll("pre")).toHaveLength(0);
  });

  it("renders args and output once opened", () => {
    const { container, getByText } = render(
      <ToolCallGroup group={{ ...base, result: "some output" }} />,
    );
    openGroup(container);
    expect(getByText("Args")).toBeDefined();
    expect(getByText("Output")).toBeDefined();
    expect(container.querySelectorAll("pre").length).toBeGreaterThan(0);
  });

  it("clamps long output to 20 lines and shows toggle", () => {
    const long = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const { getByText, container } = render(
      <ToolCallGroup group={{ ...base, result: long }} />,
    );
    openGroup(container);
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
    openGroup(container);
    const toggle = getByText("Show more");
    fireEvent.click(toggle);
    expect(queryByText("Show more")).toBeNull();
    const pres = container.querySelectorAll("pre");
    const resultPre = pres[pres.length - 1] as HTMLPreElement | undefined;
    expect(resultPre?.textContent).not.toBeNull();
    expect(resultPre!.textContent!.split("\n")).toHaveLength(50);
  });
});
