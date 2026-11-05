/** @vitest-environment jsdom */
/**
 * Session History, rendered: the shared searchable listing with the
 * session-only row (label + age). The data rules live in
 * `session-history.test.ts`; here the guarantees are the ones only the mounted
 * component can make — that the server's first page is not refetched, that
 * typing reaches the action with the project and the page cursor, and that the
 * row opens the session.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { CodingAgentSessionListing } from "@/lib/features/code/types";

const mocks = vi.hoisted(() => ({
  fetchSessions: vi.fn(),
}));

vi.mock("@/lib/features/code/actions", () => ({
  getCodingAgentSessions: (input: unknown) => mocks.fetchSessions(input),
}));

vi.mock("@/components/chat/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

const { SessionHistory } = await import("@/components/code/session-history");
const { formatRelativeDate } = await import("@/lib/utils/format-relative-date");

const session = (
  i: number,
  label: string,
  ageMs: number,
): CodingAgentSessionListing => ({
  id: `id-${i}`,
  sessionId: `session-${i}`,
  label,
  updatedAt: new Date(Date.now() - ageMs),
});

const twoSessions = () => [
  session(1, "Fix the login flow", 2 * 3_600_000),
  session(2, "Write the spec", 60_000),
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SessionHistory", () => {
  it("renders the server's first page without refetching it", () => {
    render(
      <SessionHistory
        project="alpha"
        initialSessions={twoSessions()}
        initialHasMore={false}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Session History" }),
    ).toBeTruthy();
    expect(screen.getByText("Fix the login flow")).toBeTruthy();
    expect(screen.getByText("Write the spec")).toBeTruthy();
    expect(mocks.fetchSessions).not.toHaveBeenCalled();
  });

  it("links every row to its session and shows its age", () => {
    render(
      <SessionHistory
        project="alpha"
        initialSessions={twoSessions()}
        initialHasMore={false}
      />,
    );

    const links = Array.from(
      document.querySelectorAll('[data-testid="session-history-link"]'),
    );
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/agent/code/alpha/session-1",
      "/agent/code/alpha/session-2",
    ]);
    expect(document.body.textContent).toContain("2h ago");
    expect(document.body.textContent).toContain("1m ago");
  });

  it("shows the empty state instead of a list with no rows", () => {
    render(
      <SessionHistory
        project="alpha"
        initialSessions={[]}
        initialHasMore={false}
      />,
    );

    expect(screen.getByText("No sessions found.")).toBeTruthy();
  });

  it("searches the project's sessions once the filter settles", async () => {
    mocks.fetchSessions.mockResolvedValue({
      sessions: [session(1, "Fix the login flow", 0)],
      hasMore: false,
    });
    render(
      <SessionHistory
        project="alpha"
        initialSessions={twoSessions()}
        initialHasMore={false}
      />,
    );

    fireEvent.change(screen.getByTestId("session-history-filter"), {
      target: { value: "login" },
    });

    await waitFor(() =>
      expect(mocks.fetchSessions).toHaveBeenCalledWith({
        project: "alpha",
        limit: 20,
        offset: 0,
        filter: "login",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Write the spec")).toBeNull(),
    );
    expect(screen.getByText("Fix the login flow")).toBeTruthy();
  });
});

describe("formatRelativeDate", () => {
  const now = new Date("2024-03-12T12:00:00Z");

  it("uses the compact age the row shows", () => {
    expect(
      formatRelativeDate(new Date("2024-03-12T11:59:40Z"), now),
    ).toBe("just now");
    expect(formatRelativeDate(new Date("2024-03-12T11:30:00Z"), now)).toBe(
      "30m ago",
    );
    expect(formatRelativeDate(new Date("2024-03-12T07:00:00Z"), now)).toBe(
      "5h ago",
    );
    expect(formatRelativeDate(new Date("2024-03-09T12:00:00Z"), now)).toBe(
      "3d ago",
    );
  });

  it("falls back to the calendar date once a week has passed", () => {
    expect(formatRelativeDate(new Date("2024-02-12T12:00:00Z"), now)).toBe(
      "12 Feb",
    );
  });

  it("treats a future timestamp as just now", () => {
    expect(formatRelativeDate(new Date("2024-03-12T12:05:00Z"), now)).toBe(
      "just now",
    );
  });
});
