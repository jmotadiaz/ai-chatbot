/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse, type PathParams } from "msw";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { setupMswServer } from "../../helpers/msw-server";
import { ChatProvider, useChatContext } from "@/components/chat/provider";
import { useModelPicker } from "@/components/chat/model-picker";
import { ModelCatalogProvider } from "@/lib/features/foundation-model/model-catalog-context";
import type { GatewayModelEntry } from "@/lib/features/foundation-model/config";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const base: Omit<GatewayModelEntry, "id" | "temperature" | "isDefault"> = {
  company: "mock",
  contextWindow: 128000,
  maxTokens: 8192,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  reasoning: false,
  thinkingLevels: [],
  defaultThinkingLevel: null,
  supportedFiles: [],
  supportedOutput: ["text"],
  zeroDataRetention: true,
  topP: null,
  topK: null,
};
const CATALOG: GatewayModelEntry[] = [
  { ...base, id: "basicChat", isDefault: true, temperature: 0.6 },
  { ...base, id: "alwaysRefuses", isDefault: false, temperature: 1 },
];
const postBodies: Record<string, unknown>[] = [];
setupMswServer(
  http.post<PathParams, Record<string, unknown>>("*/api/chat", async ({ request }) => {
    postBodies.push(await request.json());
    return new HttpResponse(null, { status: 500 });
  }),
);
const Probe = () => {
  const chat = useChatContext();
  const picker = useModelPicker();
  return (
    <>
      <output data-testid="temperature">{String(chat.temperature)}</output>
      <button type="button" onClick={() => picker.setSelectedModel("alwaysRefuses")}>
        switch to alwaysRefuses
      </button>
      <button type="button" onClick={() => picker.setSelectedModel("basicChat")}>
        switch to basicChat
      </button>
      <button type="button" onClick={() => chat.setConfig({ temperature: 0.5 })}>
        edit temperature
      </button>
      <form onSubmit={chat.handleSubmit}>
        <input aria-label="message" value={chat.input} onChange={(event) => chat.setInput(event.target.value)} />
        <button type="submit">send</button>
      </form>
    </>
  );
};
const renderProbe = () =>
  render(
    <ModelCatalogProvider catalog={CATALOG}>
      <NuqsTestingAdapter searchParams="">
        <ChatProvider selectedModel="basicChat" preventChatPersistence={true}>
          <Probe />
        </ChatProvider>
      </NuqsTestingAdapter>
    </ModelCatalogProvider>,
  );
const temperatureShown = () => screen.getByTestId("temperature").textContent;
afterEach(() => {
  cleanup();
  postBodies.length = 0;
});

describe("model switch applies the selected model's configuration", () => {
  it("sends the declared temperature of the model picked in the picker", async () => {
    renderProbe();
    expect(temperatureShown()).toBe("0.6");
    fireEvent.click(screen.getByRole("button", { name: "switch to alwaysRefuses" }));
    expect(temperatureShown()).toBe("1");
    fireEvent.change(screen.getByLabelText("message"), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "send" }));
    await waitFor(() => expect(postBodies).toHaveLength(1));
    expect(postBodies[0]).toMatchObject({
      selectedModel: "alwaysRefuses",
      temperature: 1,
    });
  });

  it("resets an edited temperature to the new model's default on switch", () => {
    renderProbe();
    fireEvent.click(screen.getByRole("button", { name: "edit temperature" }));
    expect(temperatureShown()).toBe("0.5");
    fireEvent.click(screen.getByRole("button", { name: "switch to alwaysRefuses" }));
    expect(temperatureShown()).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "switch to basicChat" }));
    expect(temperatureShown()).toBe("0.6");
  });
});
