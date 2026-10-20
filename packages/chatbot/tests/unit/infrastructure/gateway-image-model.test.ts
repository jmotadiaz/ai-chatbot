import { afterEach, describe, expect, it, vi } from "vitest";
import type { LanguageModelV3CallOptions } from "@/lib/infrastructure/ai/types";
import { IMAGE_CONTRACT, IMAGE_MEDIA_TYPE, createGatewayImageModel } from "@/lib/infrastructure/ai/gateway-image-model";
import { MOCK_IMAGE_PNG_BASE64 } from "@/tests/mocks/gateway/server";

/**
 * Unit del transport propio del contrato `image-default` (spec §2.4):
 * mapeo prompt V3 → mensajes OpenAI (con `image_url`) y respuesta OpenAI
 * multipart → `LanguageModelV3Content` (`text` + `file`). `fetch` va con
 * stub — la integración real contra el Mock Model Gateway vive en
 * `tests/integration/infrastructure/gateway-image-model.test.ts`.
 */

const IMAGE_DATA_URL = `data:${IMAGE_MEDIA_TYPE};base64,${MOCK_IMAGE_PNG_BASE64}`;

const USER_IMAGE_ATTACHMENT = {
  type: "file" as const,
  mediaType: IMAGE_MEDIA_TYPE,
  filename: "photo.png",
  data: new URL(IMAGE_DATA_URL),
};

const prompt: LanguageModelV3CallOptions["prompt"] = [
  {
    role: "system",
    content: "Edit the photo.",
  },
  {
    role: "user",
    content: [
      { type: "text", text: "Brighten this image" },
      USER_IMAGE_ATTACHMENT,
    ],
  },
];

const options = (overrides: Partial<LanguageModelV3CallOptions> = {}): LanguageModelV3CallOptions => ({
  prompt,
  includeRawChunks: false,
  ...overrides,
});

/** Capture del fetch: guarda url/body y devuelve la respuesta del Gateway. */
function stubFetch(response: unknown, status = 200) {
  const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(response), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const gatewayResponse = {
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Enhanced image (mock)." },
          { type: "image_url", image_url: { url: IMAGE_DATA_URL } },
        ],
      },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 12, completion_tokens: 40, total_tokens: 52 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gateway-image-model (contrato image-default)", () => {
  it("POST /chat/completions con model, modalities e image_url del adjunto", async () => {
    const fetchMock = stubFetch(gatewayResponse);
    const model = createGatewayImageModel();

    await model.doGenerate(options());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(call[0]).toMatch(/\/chat\/completions$/);
    const body = JSON.parse(String(call[1].body)) as {
      model: string;
      modalities: string[];
      messages: Array<{ role: string; content: unknown }>;
      temperature?: number;
    };
    expect(body.model).toBe(IMAGE_CONTRACT);
    expect(body.modalities).toEqual(["image", "text"]);
    expect(body.messages).toEqual([
      { role: "system", content: "Edit the photo." },
      {
        role: "user",
        content: [
          { type: "text", text: "Brighten this image" },
          { type: "image_url", image_url: { url: IMAGE_DATA_URL } },
        ],
      },
    ]);
    // Los parámetros opcionales del caller viajan solo si están definidos.
    expect(body.temperature).toBeUndefined();
  });

  it("mapea la respuesta multipart a content text + file (GeneratedFile)", async () => {
    stubFetch(gatewayResponse);
    const model = createGatewayImageModel();

    const result = await model.doGenerate(options());

    expect(result.content).toHaveLength(2);
    const [text, file] = result.content as [
      { type: "text"; text: string },
      { type: "file"; mediaType: string; data: string },
    ];
    expect(text.type).toBe("text");
    expect(text.text).toBe("Enhanced image (mock).");
    expect(file.type).toBe("file");
    expect(file.mediaType).toBe(IMAGE_MEDIA_TYPE);
    expect(file.data).toBe(MOCK_IMAGE_PNG_BASE64);

    expect(result.finishReason).toEqual({ unified: "stop", raw: "stop" });
    expect(result.usage.inputTokens).toMatchObject({ total: 12, noCache: 12 });
    expect(result.usage.outputTokens).toMatchObject({ total: 40, text: 40 });
  });

  it("acepta también content como string plano", async () => {
    stubFetch({
      choices: [
        {
          message: { role: "assistant", content: "solo texto" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    });
    const model = createGatewayImageModel();

    const result = await model.doGenerate(options());
    expect(result.content).toEqual([{ type: "text", text: "solo texto" }]);
  });

  it("lanza si el Gateway no responde 2xx", async () => {
    stubFetch({ error: "boom" }, 500);
    const model = createGatewayImageModel();

    await expect(model.doGenerate(options())).rejects.toThrow(/Image generation request failed/);
  });

  it("doStream re-emette doGenerate en stream parts (texto + file + finish)", async () => {
    stubFetch(gatewayResponse);
    const model = createGatewayImageModel();

    const { stream } = await model.doStream(options());
    const reader = stream.getReader();
    const parts: Array<Record<string, unknown>> = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value as unknown as Record<string, unknown>);
    }

    expect(parts[0]).toMatchObject({ type: "stream-start" });
    expect(parts.slice(1, 4)).toEqual([
      { type: "text-start", id: "text-0" },
      { type: "text-delta", id: "text-0", delta: "Enhanced image (mock)." },
      { type: "text-end", id: "text-0" },
    ]);
    expect(parts[4]).toMatchObject({
      type: "file",
      mediaType: IMAGE_MEDIA_TYPE,
      data: MOCK_IMAGE_PNG_BASE64,
    });
    expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: { unified: "stop" } });
  });
});
