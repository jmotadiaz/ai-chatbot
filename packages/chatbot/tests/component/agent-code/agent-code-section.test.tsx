/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { AgentCodeSection } from "@/components/layout/sidebar/agent-code-section";

// react-collapsed observa tamaño con ResizeObserver (no existe en jsdom).
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const mocks = vi.hoisted(() => ({
  pathname: "/",
  push: vi.fn(),
  sessions: vi.fn(),
  create: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/features/code/actions", () => ({
  getCodingAgentSessions: (project: string, limit?: number) =>
    mocks.sessions(project, limit),
  createCodingAgentSession: (project: string) => mocks.create(project),
}));

const session = (i: number) => ({
  id: `id-${i}`,
  sessionId: `session-${i}`,
  label: `Label ${i}`,
  updatedAt: new Date(),
});

// react-collapsed pide aria-controls a un id estable; se lo pasamos con data-id
const projectItem = (name: string) =>
  document.querySelector(
    `[data-testid="agent-project-item"][aria-label="${name}"]`,
  );

describe("AgentCodeSection", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.pathname = "/";
  });

  it("renders every project from props", () => {
    render(<AgentCodeSection projects={["alpha", "beta"]} />);
    expect(projectItem("alpha")).not.toBeNull();
    expect(projectItem("beta")).not.toBeNull();
  });

  it("lazy-loads the sessions of an expanded project with limit 10", async () => {
    mocks.sessions.mockResolvedValue([session(1), session(2)]);
    mocks.pathname = "/chat/abc";
    const { getByRole } = render(
      <AgentCodeSection projects={["alpha", "beta"]} />,
    );

    fireEvent.click(getByRole("button", { name: "alpha" }));

    await waitFor(() => expect(mocks.sessions).toHaveBeenCalledWith("alpha", 10));
    // Los links de sesión apuntan a la ruta del proyecto.
    expect(
      document.querySelector('[data-testid="agent-session-link"][href="/agent/code/alpha/session-1"]'),
    ).not.toBeNull();
  });

  it("keeps only one project open at a time (exclusivity)", async () => {
    mocks.sessions.mockResolvedValue([]);
    const { getByRole } = render(
      <AgentCodeSection projects={["alpha", "beta"]} />,
    );

    fireEvent.click(getByRole("button", { name: "alpha" }));
    fireEvent.click(getByRole("button", { name: "beta" }));

    const alpha = getByRole("button", { name: "alpha" });
    const beta = getByRole("button", { name: "beta" });
    await waitFor(() => expect(beta.getAttribute("aria-expanded")).toBe("true"));
    expect(alpha.getAttribute("aria-expanded")).toBe("false");
    expect(mocks.sessions).toHaveBeenCalledTimes(2);
  });

  it("highlights the project and session of the current route", async () => {
    mocks.sessions.mockResolvedValue([session(1), session(2)]);
    mocks.pathname = "/agent/code/alpha/session-1";
    render(<AgentCodeSection projects={["alpha", "beta"]} />);

    await waitFor(() =>
      expect(mocks.sessions).toHaveBeenCalledWith("alpha", 10),
    );
    const projectRow = window.document.querySelector(
      '[data-testid="agent-project-item"][aria-label="alpha"]',
    );
    expect(projectRow?.className).toContain("bg-gray-200");

    const activeLink = window.document.querySelector(
      '[data-testid="agent-session-link"][href="/agent/code/alpha/session-1"]',
    );
    expect(activeLink?.closest(".bg-gray-200")).not.toBeNull();
  });

  it("renders the label or falls back to the session id", async () => {
    mocks.sessions.mockResolvedValue([{ ...session(1), label: null }]);
    render(<AgentCodeSection projects={["alpha"]} />);
    fireEvent.click(document.querySelector('[aria-label="alpha"]')!);

    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="agent-session-link"]')?.textContent,
      ).toContain("session-1");
    });
  });

  it("creates a session and navigates on the + button", async () => {
    mocks.create.mockResolvedValue({ sessionId: "brand-new" });
    render(<AgentCodeSection projects={["alpha"]} />);

    fireEvent.click(
      document.querySelector('[data-testid="agent-new-session"]')!,
    );

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith("alpha"));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/agent/code/alpha/brand-new",
      ),
    );
  });

  it("auto-expands the project of the route on mount and on navigation", async () => {
    mocks.sessions.mockResolvedValue([]);
    mocks.pathname = "/agent/code/beta/session-9";
    const { rerender } = render(
      <AgentCodeSection projects={["alpha", "beta"]} />,
    );

    await waitFor(() =>
      expect(mocks.sessions).toHaveBeenCalledWith("beta", 10),
    );

    // Navegación a otra sesión (cambio de pathname) → manda la ruta.
    mocks.sessions.mockClear();
    mocks.pathname = "/agent/code/alpha/session-3";
    rerender(<AgentCodeSection projects={["alpha", "beta"]} />);

    await waitFor(() =>
      expect(mocks.sessions).toHaveBeenCalledWith("alpha", 10),
    );
  });

  it("shows the empty and loading states", async () => {
    mocks.sessions.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve([]), 50);
        }),
    );
    render(<AgentCodeSection projects={["alpha"]} />);

    fireEvent.click(document.querySelector('[aria-label="alpha"]')!);
    await waitFor(() =>
      expect(document.body.textContent).toContain("Loading sessions"),
    );

    await waitFor(() =>
      expect(document.body.textContent).toContain("No sessions yet"),
    );
  });
});