import { describe, expect, it } from "vitest";
import {
  GatewayScenarioError,
  imageReply,
  scriptedReply,
  textReply,
} from "@ai-chatbot/model-gateway-testing";
import type { ChatReply, ChatRequest } from "@ai-chatbot/model-gateway-testing";
import type { LanguageModelV3CallOptions } from "@/lib/infrastructure/ai/types";
import {
  IMAGE_CONTRACT,
  IMAGE_MEDIA_TYPE,
  createGatewayImageModel,
} from "@/lib/infrastructure/ai/gateway-image-model";
import { MOCK_IMAGE_PNG_BASE64 } from "@/tests/mocks/gateway/profiles";
import { setupGatewayHarness } from "@/tests/helpers/gateway-harness";

/**
 * The `image-default` transport's own guarantees (ADR 0013; spec §5, image row):
 * the V3 prompt → OpenAI `messages` serialization (text + `image_url` parts) and
 * the OpenAI multipart response → `LanguageModelV3Content` (`text` + `file`)
 * interpretation, including how it reports invalid image parts.
 *
 * The transport is exercised through the Gateway HTTP seam: MSW serves the
 * official toolkit's protocol fixtures, so both directions use the real wire
 * format and nothing is stubbed at the `fetch` boundary. The end-to-end path
 * (`generateImages` → AI SDK → `GeneratedFile`) lives in
 * `tests/integration/infrastructure/gateway-image-model.test.ts`.
 */

const gateway = setupGatewayHarness();

const IMAGE_TEXT = "Enhanced image (mock).";
const IMAGE_DATA_URL = `data:${IMAGE_MEDIA_TYPE};base64,${MOCK_IMAGE_PNG_BASE64}`;

/** The multipart reply the image contract answers with (text + `image_url`). */
const imageResponse = (): ChatReply =>
  imageReply({
    text: IMAGE_TEXT,
    base64: MOCK_IMAGE_PNG_BASE64,
    mediaType: IMAGE_MEDIA_TYPE,
  });

const installScenario = (reply: ChatReply | (() => ChatReply)) =>
  gateway.use({ chat: typeof reply === "function" ? () => reply() : () => reply });

const options = (
  prompt: LanguageModelV3CallOptions["prompt"],
  overrides: Partial<LanguageModelV3CallOptions> = {},
): LanguageModelV3CallOptions => ({
  prompt,
  includeRawChunks: false,
  ...overrides,
});

/** Recorded `POST /v1/chat/completions` bodies of one scenario, oldest first. */
const chatBodies = (scenario: { requests: { path: string; body: unknown }[] }): ChatRequest[] =>
  scenario.requests
    .filter((request) => request.path === "/v1/chat/completions")
    .map((request) => request.body as ChatRequest);

/** The `messages` a call serialized, as the Gateway received them. */
const sentMessages = async (
  prompt: LanguageModelV3CallOptions["prompt"],
  overrides: Partial<LanguageModelV3CallOptions> = {},
) => {
  const scenario = await installScenario(imageResponse());
  await createGatewayImageModel().doGenerate(options(prompt, overrides));
  const bodies = chatBodies(scenario);
  expect(bodies).toHaveLength(1);
  return bodies[0]!;
};

describe("gateway-image-model serialization (image-default)", () => {
  it("posts the image contract with its modalities and the prompt's image_url part", async () => {
    const body = await sentMessages([
      { role: "system", content: "Edit the photo." },
      {
        role: "user",
        content: [
          { type: "text", text: "Brighten this image" },
          {
            type: "file",
            mediaType: IMAGE_MEDIA_TYPE,
            filename: "photo.png",
            data: new URL(IMAGE_DATA_URL),
          },
        ],
      },
    ]);

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
    // The transport adds no sampling parameters of its own: the caller's
    // configuration only travels when it is defined.
    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
  });

  it("serializes every file-part data shape as an image_url and passes through the sampling params", async () => {
    const body = await sentMessages(
      [
        {
          role: "user",
          content: [
            // Already a data URL: kept verbatim.
            { type: "file", mediaType: IMAGE_MEDIA_TYPE, data: IMAGE_DATA_URL },
            // A remote URL: kept verbatim (the Gateway fetches it).
            {
              type: "file",
              mediaType: IMAGE_MEDIA_TYPE,
              data: "https://example.com/photo.png",
            },
            // Raw base64: wrapped with its media type.
            {
              type: "file",
              mediaType: IMAGE_MEDIA_TYPE,
              data: MOCK_IMAGE_PNG_BASE64,
            },
            // Bytes: encoded to base64.
            {
              type: "file",
              mediaType: IMAGE_MEDIA_TYPE,
              data: new Uint8Array(Buffer.from(MOCK_IMAGE_PNG_BASE64, "base64")),
            },
          ],
        },
      ],
      { temperature: 0.3, maxOutputTokens: 128 },
    );

    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: IMAGE_DATA_URL } },
          {
            type: "image_url",
            image_url: { url: "https://example.com/photo.png" },
          },
          { type: "image_url", image_url: { url: IMAGE_DATA_URL } },
          { type: "image_url", image_url: { url: IMAGE_DATA_URL } },
        ],
      },
    ]);
    expect(body.temperature).toBe(0.3);
    expect(body.max_tokens).toBe(128);
  });

  it("drops tool messages, maps reasoning to text and skips messages without parts", async () => {
    const body = await sentMessages([
      { role: "system", content: "Edit the photo." },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "noop",
            output: { type: "text", value: "noop result" },
          },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "The light is flat." },
          { type: "text", text: "Brightening." },
        ],
      },
      { role: "user", content: [] },
    ]);

    // The image contract uses no tools and never sends an empty turn.
    expect(body.messages).toEqual([
      { role: "system", content: "Edit the photo." },
      {
        role: "assistant",
        content: [
          { type: "text", text: "The light is flat." },
          { type: "text", text: "Brightening." },
        ],
      },
    ]);
  });
});

describe("gateway-image-model response interpretation (image-default)", () => {
  it("maps the multipart reply to a text part, the image file, finish reason and usage", async () => {
    await installScenario(imageResponse());

    const result = await createGatewayImageModel().doGenerate(
      options([{ role: "user", content: [{ type: "text", text: "Brighten it" }] }]),
    );

    expect(result.content).toEqual([
      { type: "text", text: IMAGE_TEXT },
      { type: "file", mediaType: IMAGE_MEDIA_TYPE, data: MOCK_IMAGE_PNG_BASE64 },
    ]);
    expect(result.finishReason).toEqual({ unified: "stop", raw: "stop" });
    // The Gateway's usage is reported verbatim under every V3 token bucket.
    expect(result.usage.inputTokens).toMatchObject({ total: 3, noCache: 3 });
    expect(result.usage.outputTokens).toMatchObject({ total: 10, text: 10 });
    expect(result.warnings).toEqual([]);
  });

  it("also accepts content as a plain string", async () => {
    await installScenario(textReply("text only"));

    const result = await createGatewayImageModel().doGenerate(
      options([{ role: "user", content: [{ type: "text", text: "Brighten it" }] }]),
    );

    expect(result.content).toEqual([{ type: "text", text: "text only" }]);
  });

  it("skips an image_url that is not a data: URL and reports it as a warning", async () => {
    await installScenario(
      scriptedReply([
        {
          delta: {
            role: "assistant",
            content: [
              { type: "text", text: IMAGE_TEXT },
              {
                type: "image_url",
                image_url: { url: "https://example.com/edited.png" },
              },
            ],
          },
        },
      ]),
    );

    const result = await createGatewayImageModel().doGenerate(
      options([{ role: "user", content: [{ type: "text", text: "Brighten it" }] }]),
    );

    expect(result.content).toEqual([{ type: "text", text: IMAGE_TEXT }]);
    expect(result.warnings).toEqual([
      { type: "other", message: "image_url is not a data: URL; skipped" },
    ]);
  });

  it("produces no file (and no warning) for an image part without a URL", async () => {
    await installScenario(
      scriptedReply([
        { delta: { role: "assistant", content: [{ type: "image_url" }] } },
      ]),
    );

    const result = await createGatewayImageModel().doGenerate(
      options([{ role: "user", content: [{ type: "text", text: "Brighten it" }] }]),
    );

    expect(result.content).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("rejects a malformed payload instead of silently returning no files", async () => {
    await installScenario({ steps: [], json: { unexpected: "object" } });

    await expect(
      createGatewayImageModel().doGenerate(
        options([{ role: "user", content: [{ type: "text", text: "Brighten it" }] }]),
      ),
    ).rejects.toThrow(TypeError);
  });

  it("throws when the Gateway rejects the request", async () => {
    await installScenario(() => {
      throw new GatewayScenarioError("image generation rejected", 400);
    });

    await expect(
      createGatewayImageModel().doGenerate(
        options([{ role: "user", content: [{ type: "text", text: "Brighten it" }] }]),
      ),
    ).rejects.toThrow("Image generation request failed: 400");
  });
});

describe("gateway-image-model streaming (image-default)", () => {
  it("replays the generate result as stream parts: the image arrives whole, not incrementally", async () => {
    await installScenario(imageResponse());

    const { stream } = await createGatewayImageModel().doStream(
      options([{ role: "user", content: [{ type: "text", text: "Brighten it" }] }]),
    );

    const parts: Array<Record<string, unknown>> = [];
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value as unknown as Record<string, unknown>);
    }

    expect(parts[0]).toMatchObject({ type: "stream-start", warnings: [] });
    expect(parts.slice(1, 4)).toEqual([
      { type: "text-start", id: "text-0" },
      { type: "text-delta", id: "text-0", delta: IMAGE_TEXT },
      { type: "text-end", id: "text-0" },
    ]);
    // One `file` part with the complete base64 payload: the image contract has
    // no incremental generation, so the adapter must not pretend to stream it.
    expect(parts.slice(4, -1)).toEqual([
      { type: "file", mediaType: IMAGE_MEDIA_TYPE, data: MOCK_IMAGE_PNG_BASE64 },
    ]);
    expect(parts.at(-1)).toMatchObject({
      type: "finish",
      finishReason: { unified: "stop", raw: "stop" },
    });
  });
});
