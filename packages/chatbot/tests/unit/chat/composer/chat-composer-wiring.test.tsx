/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { setupGatewayHarness } from "../../../helpers/gateway-harness";
import Chat from "@/components/chat/chat";
import { ChatProvider } from "@/components/chat/provider";
import { ModelCatalogProvider } from "@/lib/features/foundation-model/model-catalog-context";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { POST as refinePromptRoute } from "@/app/(chat)/api/refine-prompt/route";
import { TEST_MODELS } from "@/tests/mocks/gateway/catalog";

// Auth and the in-process route shim omit cookie authentication and Next.js
// HTTP routing; those boundaries remain covered separately.
const authMock = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/features/auth/auth-config", () => ({
  auth: authMock.auth,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const gateway = setupGatewayHarness();

function routeRefinePromptToHandler() {
  const transport = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/refine-prompt") {
        return refinePromptRoute(new Request(url, init));
      }
      return transport(input, init);
    },
  );
}

function renderComposer(
  selectedModel: chatModelId,
  refinePromptMode?: "chat",
) {
  return render(
    <ModelCatalogProvider catalog={TEST_MODELS}>
      <NuqsTestingAdapter searchParams="">
        <ChatProvider
          selectedModel={selectedModel}
          refinePromptMode={refinePromptMode}
          isNewChat
          preventChatPersistence
        >
          <Chat />
        </ChatProvider>
      </NuqsTestingAdapter>
    </ModelCatalogProvider>,
  );
}

function openAttachmentMenu() {
  fireEvent.click(screen.getByLabelText("Attach files"));
  return screen.getByLabelText("Attachment options");
}

// jsdom does not implement these layout APIs; scroll behavior is not tested here.
class InertIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

describe("Chat composer wiring", () => {
  beforeEach(() => {
    vi.stubGlobal("CSS", { supports: () => true });
    vi.stubGlobal("IntersectionObserver", InertIntersectionObserver);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers Image only when the selected model's catalog entry accepts images", () => {
    renderComposer("canSeeImages");
    expect(openAttachmentMenu().textContent).toContain("Image");
    cleanup();

    renderComposer("basicChat");
    expect(openAttachmentMenu().textContent).not.toContain("Image");
  });

  it("shows the Refine button only in a refine mode", () => {
    renderComposer("basicChat");
    expect(screen.queryByLabelText("Refine prompt")).toBeNull();
  });

  it("disables Refine while the input is empty", () => {
    renderComposer("basicChat", "chat");
    const refine = screen.getByLabelText("Refine prompt") as HTMLButtonElement;
    expect(refine.disabled).toBe(true);
  });

  it("refines through the Gateway, offers Undo, and Undo restores the original text", async () => {
    routeRefinePromptToHandler();
    const scenario = await gateway.use({
      chat: () => ({ steps: [{ delta: { content: "refined text" } }] }),
    });
    renderComposer("basicChat", "chat");
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "hello world" } });
    expect(screen.queryByLabelText("Undo refined prompt")).toBeNull();
    fireEvent.click(screen.getByLabelText("Refine prompt"));

    await waitFor(() => expect(textarea.value).toBe("refined text"));
    const inference = scenario.requests.filter(
      (request) => request.path === "/v1/chat/completions",
    );
    expect(inference).toHaveLength(1);
    expect(JSON.stringify(inference[0]!.body)).toContain("hello world");

    fireEvent.click(await screen.findByLabelText("Undo refined prompt"));
    expect(textarea.value).toBe("hello world");
    expect(screen.queryByLabelText("Undo refined prompt")).toBeNull();
  });
});
