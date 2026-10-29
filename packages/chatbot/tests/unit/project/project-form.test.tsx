/**
 * Social unit tests for the Project configuration form (ticket 06).
 *
 * Renders the REAL `ProjectForm` (model picker, Advanced panel, Test Chat) and
 * holds only the external boundaries: the Project server action, the RAG
 * resource action, routing and the Model Gateway HTTP seam (MSW). They replace
 * the two E2E cases that covered this form without a distinct browser
 * guarantee: creating a project with advanced settings and using the Test Chat
 * from the configuration view.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse, type PathParams } from "msw";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/features/project/actions", () => ({ updateProject: vi.fn() }));
vi.mock("@/lib/features/rag/actions", () => ({
  getProjectResourcesAction: vi.fn(),
}));
// jsdom does not implement these layout APIs; scroll behavior is not tested here.
vi.stubGlobal("CSS", { supports: () => true });
Element.prototype.scrollTo = () => {};
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}));
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  },
);

import { setupMswServer } from "../../helpers/msw-server";
import { ProjectForm } from "@/components/project/form";
import { updateProject } from "@/lib/features/project/actions";
import { getProjectResourcesAction } from "@/lib/features/rag/actions";
import { ModelCatalogProvider } from "@/lib/features/foundation-model/model-catalog-context";
import type { GatewayModelEntry } from "@/lib/features/foundation-model/config";
import type { Project } from "@/lib/features/project/types";

const MODEL: GatewayModelEntry = {
  id: "basicChat",
  company: "test",
  isDefault: true,
  contextWindow: 8192,
  maxTokens: 1024,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  reasoning: false,
  thinkingLevels: [],
  defaultThinkingLevel: null,
  supportedFiles: [],
  supportedOutput: ["text"],
  zeroDataRetention: false,
  temperature: 0.6,
  topP: null,
  topK: null,
};

const PROJECT: Project = {
  id: "0b9e6c1e-1111-4222-8333-444455556666",
  userId: "4f1d2c3b-5555-4666-8777-888899990000",
  name: "Research Assistant",
  defaultModel: "basicChat",
  defaultTemperature: null,
  defaultTopP: null,
  defaultTopK: null,
  ragMaxResources: null,
  webSearchNumResults: null,
  systemPrompt: "Draft prompt",
  hasPromptRefiner: false,
  tools: [],
  isActive: true,
  disableCompaction: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

let postBodies: Record<string, unknown>[];
setupMswServer(
  http.post<PathParams, Record<string, unknown>>("*/api/chat", async ({ request }) => {
    const body: Record<string, unknown> = await request.json();
    postBodies.push(body);
    return new HttpResponse(null, { status: 500 });
  }),
);

const renderForm = () =>
  render(
    <ModelCatalogProvider catalog={[MODEL]}>
      <NuqsTestingAdapter searchParams="">
        <ProjectForm project={PROJECT} mode="edit" />
      </NuqsTestingAdapter>
    </ModelCatalogProvider>,
  );

const sendFromTestChat = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Test Chat" }));
  const input = await screen.findByTestId("chat-input");
  fireEvent.change(input, { target: { value: "Test drive" } });
  const form = input.closest("form");
  if (!form) throw new Error("Test Chat input is not inside a form");
  fireEvent.submit(form);
  await waitFor(() => expect(postBodies).toHaveLength(1));
};

beforeEach(() => {
  postBodies = [];
  vi.mocked(updateProject).mockReset();
  vi.mocked(updateProject).mockResolvedValue(undefined as never);
  vi.mocked(getProjectResourcesAction).mockResolvedValue({
    items: [],
    hasMore: false,
  });
});

afterEach(() => {
  cleanup();
});

describe("ProjectForm Test Chat", () => {
  it("uses the model's catalog temperature while Advanced is closed", async () => {
    renderForm();
    await sendFromTestChat();
    expect(postBodies[0]).toMatchObject({
      selectedModel: "basicChat",
      temperature: 0.6,
      systemPrompt: "Draft prompt",
      preventChatPersistence: true,
    });
    expect(postBodies[0].chatId).toBeUndefined();
  });

  it("sends the draft temperature from the open Advanced panel", async () => {
    renderForm();
    fireEvent.click(screen.getByText("Advanced"));
    const temperature = screen.getByLabelText("Temperature");
    fireEvent.change(temperature, { target: { value: "0.8" } });
    fireEvent.blur(temperature);
    await sendFromTestChat();
    expect(postBodies[0]).toMatchObject({
      temperature: 0.8,
      preventChatPersistence: true,
    });
  });
});

describe("ProjectForm advanced settings", () => {
  const save = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save Project" }));
    await waitFor(() => expect(updateProject).toHaveBeenCalledTimes(1));
    return vi.mocked(updateProject).mock.calls[0][1] as Record<string, unknown>;
  };

  it("persists the temperature raised in the Advanced panel", async () => {
    renderForm();
    fireEvent.click(screen.getByText("Advanced"));
    const advancedTemperature = screen.getByTestId("input-number-temperature");
    const increment = advancedTemperature.querySelector(
      'button[aria-label="Increase value"]',
    );
    if (!increment) throw new Error("Temperature stepper is missing");
    // Model default 0.6 + 2 x 0.1, as the removed E2E case did.
    fireEvent.click(increment);
    fireEvent.click(increment);

    const payload = await save();

    expect(payload).toMatchObject({
      name: "Research Assistant",
      defaultModel: "basicChat",
      defaultTemperature: 0.8,
      isActive: true,
    });
  });

  it("leaves the advanced settings unset while Advanced stays closed", async () => {
    renderForm();

    const payload = await save();

    expect(payload.defaultTemperature).toBeUndefined();
    expect(payload.defaultTopP).toBeUndefined();
    expect(payload.defaultTopK).toBeUndefined();
  });
});
