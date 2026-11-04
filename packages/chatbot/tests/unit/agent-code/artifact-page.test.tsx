/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/features/auth/cached-auth", () => ({
  getSession: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

vi.mock("config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("config")>();
  return {
    ...actual,
    config: {
      codingAgentEnabled: () => true,
    },
  };
});

// next/navigation notFound should not throw in happy path
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
}));

// Sidebar/Header building blocks pull providers; mock minimally
vi.mock("@/components/layout/sidebar/sidebar", () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));
vi.mock("@/components/layout/header/logo", () => ({ Logo: () => <div>logo</div> }));
vi.mock("@/components/layout/header/theme-toggle", () => ({ ThemeToggle: () => <div>theme</div> }));
vi.mock("@/components/ui/main", () => ({ Main: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

import Page from "@/app/(chat)/agent/code/[project]/[sessionId]/artifacts/[artifact]/page";

afterEach(cleanup);

describe("ArtifactPage", () => {
  it("renders back-to-chat link and sandboxed iframe", async () => {
    const params = Promise.resolve({ project: "proj", sessionId: "s1", artifact: "diagram" });
    const element = await (Page as unknown as (props: { params: Promise<unknown> }) => Promise<React.ReactElement>)({ params });
    const rendered = typeof element?.type === "function" ? await (element.type as (p: unknown) => Promise<React.ReactElement>)(element.props) : element;
    render(rendered);
    const back = screen.getByRole("link", { name: /back to chat/i });
    // aria-label exact
    expect(back.getAttribute("aria-label")).toBe("Back to chat");
    expect(back.getAttribute("href")).toBe("/agent/code/proj/s1");
    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute("src")).toBe("/api/agent/code/proj/artifacts/diagram");
    expect(iframe!.getAttribute("sandbox")).toBe("allow-scripts allow-downloads allow-popups");
    expect(iframe!.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });
});
