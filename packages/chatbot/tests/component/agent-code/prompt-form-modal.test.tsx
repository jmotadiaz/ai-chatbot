/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PromptFormModal } from "@/components/code/prompt-form-modal";
import type { PromptSummary, SessionSummary } from "@/lib/features/code/worker-client";

const promptWithSession: PromptSummary = {
  name: "review",
  description: "Review a session",
  inputs: [
    {
      name: "target_session",
      kind: "session",
      description: "Session",
      required: true,
    },
  ],
};

const sessions: SessionSummary[] = [
  { sessionId: "s1", label: "Session A" },
  { sessionId: "s2", label: "Session B" },
];

function renderModal(overrides: { sessions?: SessionSummary[]; onInsert?: () => void } = {}) {
  return render(
    <PromptFormModal
      prompt={promptWithSession}
      sessionId="current"
      sessions={overrides.sessions ?? sessions}
      open
      onClose={() => {}}
      onInsert={overrides.onInsert ?? (() => {})}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PromptFormModal session input", () => {
  it("renders a select with the labeled sessions for kind session inputs", () => {
    renderModal();

    const select = screen.getByLabelText(/Session/) as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toContain("Session A");
    expect(labels).toContain("Session B");
    const emptyOption = select.options[0];
    expect(emptyOption!.value).toBe("");
  });

  it("shows a hint and disables submit when there are no labeled sessions", () => {
    renderModal({ sessions: [] });

    expect(screen.getByText("No hay sessions con label disponibles")).toBeTruthy();
    // toBeDisabled is a jest-dom matcher, which is not registered in this
    // repo's vitest setup; assert the native property instead.
    expect(screen.getByRole("button", { name: "Insert" })).toHaveProperty("disabled", true);
  });

  it("submits the selected sessionId to the resolve API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: "resolved" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const onInsert = vi.fn();

    renderModal({ onInsert });

    const select = screen.getByLabelText(/Session/) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "s2" } });
    fireEvent.click(screen.getByRole("button", { name: "Insert" }));

    await waitFor(() => expect(onInsert).toHaveBeenCalledWith("resolved"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agent/code/sessions/current/prompts/resolve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          promptName: "review",
          values: { target_session: "s2" },
        }),
      }),
    );
  });
});
