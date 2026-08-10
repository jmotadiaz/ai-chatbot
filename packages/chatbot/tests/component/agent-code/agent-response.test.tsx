/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { AgentResponse } from "@/components/code/agent-response";
import { TurnFilesChanged } from "@/components/code/turn-files-changed";
import { FileBrowserProvider } from "@/components/code/file-browser/file-browser-provider";

afterEach(cleanup);

const wrap = (ui: React.ReactNode) => (
  <FileBrowserProvider project="proj" sessionId="s1">
    {ui}
  </FileBrowserProvider>
);

describe("AgentResponse file references", () => {
  it("routes file: links to the full-file view", async () => {
    const { container } = render(
      wrap(<AgentResponse>{"See [`src/a.ts`](file:src/a.ts) for details."}</AgentResponse>),
    );
    await waitFor(() => {
      const link = container.querySelector('[data-testid="agent-file-link"]');
      expect(link).not.toBeNull();
      expect(link!.getAttribute("href")).toBe(
        "/agent/code/proj/s1/files?scope=tree&file=src%2Fa.ts",
      );
    });
  });

  it("renders unsafe file references as plain text", async () => {
    const { container } = render(
      wrap(<AgentResponse>{"Bad [link](file:../outside.ts)."}</AgentResponse>),
    );
    await waitFor(() => {
      expect(container.textContent).toContain("link");
    });
    expect(container.querySelector('[data-testid="agent-file-link"]')).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });

  it("keeps regular links external", async () => {
    const { container } = render(
      wrap(<AgentResponse>{"Docs at [example](https://example.com)."}</AgentResponse>),
    );
    await waitFor(() => {
      const link = container.querySelector("a");
      expect(link).not.toBeNull();
      expect(link!.getAttribute("href")).toBe("https://example.com");
      expect(link!.getAttribute("target")).toBe("_blank");
    });
  });
});

describe("TurnFilesChanged", () => {
  it("links each file to the diff view", () => {
    const { getByText, container } = render(
      wrap(
        <TurnFilesChanged
          files={[
            { path: "src/a.ts", status: "modified" },
            { path: "new.ts", status: "untracked" },
          ]}
        />,
      ),
    );
    expect(getByText("Files changed")).toBeDefined();
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(2);
    expect(links[0]!.getAttribute("href")).toBe(
      "/agent/code/proj/s1/files?scope=uncommitted&file=src%2Fa.ts",
    );
    expect(links[1]!.getAttribute("href")).toBe(
      "/agent/code/proj/s1/files?scope=uncommitted&file=new.ts",
    );
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(wrap(<TurnFilesChanged files={[]} />));
    expect(
      container.querySelector('[data-testid="turn-files-changed"]'),
    ).toBeNull();
  });
});
