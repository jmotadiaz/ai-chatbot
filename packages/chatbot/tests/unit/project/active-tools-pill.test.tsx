/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActiveToolsPill } from "@/components/chat/tools/active-tools-pill";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import { WEB_SEARCH_TOOL } from "@/lib/features/web-search/constants";

describe("ActiveToolsPill", () => {
  it("hides the RAG pill in a project chat and keeps the other tools", () => {
    render(
      <ActiveToolsPill
        tools={[RAG_TOOL, WEB_SEARCH_TOOL]}
        onDeleteTool={vi.fn()}
        projectId="project-1"
      />,
    );

    expect(screen.queryByTestId(`active-tool-pill-${RAG_TOOL}`)).toBeNull();
    expect(
      screen.getByTestId(`active-tool-pill-${WEB_SEARCH_TOOL}`),
    ).toBeDefined();
  });

  it("shows the RAG pill outside a project", () => {
    render(<ActiveToolsPill tools={[RAG_TOOL]} onDeleteTool={vi.fn()} />);

    expect(screen.getByTestId(`active-tool-pill-${RAG_TOOL}`)).toBeDefined();
  });
});
