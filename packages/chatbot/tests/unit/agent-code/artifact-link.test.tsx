/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { AgentResponse } from "@/components/code/agent-response";
import { FileBrowserProvider } from "@/components/code/file-browser/file-browser-provider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(cleanup);

const wrap = (ui: React.ReactNode) => (
  <FileBrowserProvider project="proj" sessionId="s1">
    {ui}
  </FileBrowserProvider>
);

describe("AgentResponse artifact links", () => {
  it("routes artifact links to the artifact view using the active context", async () => {
    const { container } = render(
      wrap(
        <AgentResponse>
          {"See [Diagram](/agent/code/other/other/artifacts/diagram) for details."}
        </AgentResponse>,
      ),
    );
    await waitFor(() => {
      const link = container.querySelector('[data-testid="agent-artifact-link"]');
      expect(link).not.toBeNull();
      expect(link!.getAttribute("href")).toBe(
        "/agent/code/proj/s1/artifacts/diagram",
      );
      expect(link!.getAttribute("target")).toBeNull();
    });
  });

  it("keeps regular external links with target=_blank", async () => {
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
