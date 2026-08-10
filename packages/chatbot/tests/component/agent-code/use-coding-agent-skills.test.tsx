/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupMswServer } from "../../helpers/msw-server";
import { useCodingAgentSkills } from "@/lib/features/code/hooks/use-coding-agent-skills";
import type { CodingAgentSkill } from "@/components/code/skills-control";

const SKILLS: CodingAgentSkill[] = [
  { name: "brainstorming", description: "Explore the problem space" },
  { name: "test-driven-development", description: "Red, green, refactor" },
];

let requestCount = 0;

const server = setupMswServer(
  http.get("*/api/agent/code/sessions/s1/skills", () => {
    requestCount += 1;
    return HttpResponse.json({ skills: SKILLS });
  }),
);

describe("useCodingAgentSkills", () => {
  beforeEach(() => {
    requestCount = 0;
  });

  it("loads the session skills from the API", async () => {
    const { result } = renderHook(() => useCodingAgentSkills("s1", true));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.skills).toEqual(SKILLS);
    expect(result.current.error).toBeNull();
  });

  it("sets an error when the request fails", async () => {
    server.use(
      http.get(
        "*/api/agent/code/sessions/s1/skills",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useCodingAgentSkills("s1", true));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.skills).toEqual([]);
    expect(result.current.error).toBe("Skills could not be loaded.");
  });

  it("uses the server-resolved skills without fetching", async () => {
    const { result } = renderHook(() =>
      useCodingAgentSkills("s1", true, SKILLS),
    );

    expect(result.current.skills).toEqual(SKILLS);
    expect(result.current.isLoading).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requestCount).toBe(0);
  });

  it("treats an empty server-resolved list as an answer, not as a missing one", async () => {
    renderHook(() => useCodingAgentSkills("s1", true, []));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requestCount).toBe(0);
  });

  it("still fetches when the server could not resolve the skills", async () => {
    const { result } = renderHook(() =>
      useCodingAgentSkills("s1", true, null),
    );

    await waitFor(() => expect(result.current.skills).toEqual(SKILLS));
    expect(requestCount).toBe(1);
  });
});
