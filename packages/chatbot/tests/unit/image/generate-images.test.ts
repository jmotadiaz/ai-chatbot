import { describe, expect, it } from "vitest";
import {
  GatewayScenarioError,
  imageReply,
  textReply,
} from "@ai-chatbot/model-gateway-testing";
import type { ChatReply, ChatRequest } from "@ai-chatbot/model-gateway-testing";
import { generateImages } from "@/lib/features/image/actions";
import { IMAGE_CONTRACT, IMAGE_MEDIA_TYPE } from "@/lib/infrastructure/ai/gateway-image-model";
import type { ChatbotMessage } from "@/lib/features/chat/types";
import { MOCK_IMAGE_PNG_BASE64 } from "@/tests/mocks/gateway/profiles";
import { setupGatewayHarness } from "@/tests/helpers/gateway-harness";

/**
 * The image feature over the Gateway HTTP seam (ADR 0013; spec §5, image row):
 * `generateImages` → `inferenceKit.languageModel("image-default")` → the image
 * transport → MSW. Both the request (contract, modalities, the attachment's
 * `image_url` part) and the response (the parsed `GeneratedFile`) are the real
 * wire formats the production integration uses, and no gateway has to be
 * listening on `:4001`.
 *
 * This is the regression guard for the bug where the generic
 * `openai-compatible` transport answered `files: []` because it does not parse
 * the response's `image_url` parts.
 */

const gateway = setupGatewayHarness();

const IMAGE_TEXT = "Enhanced image (mock).";
const IMAGE_DATA_URL = `data:${IMAGE_MEDIA_TYPE};base64,${MOCK_IMAGE_PNG_BASE64}`;

/** The message the image editor posts: a prompt plus one attached image. */
const editionMessage = {
  id: "message-1",
  role: "user",
  parts: [
    { type: "text", text: "Brighten this image" },
    {
      type: "file",
      mediaType: IMAGE_MEDIA_TYPE,
      filename: "photo.png",
      url: IMAGE_DATA_URL,
    },
  ],
} as unknown as ChatbotMessage;

const imageResponse = (): ChatReply =>
  imageReply({
    text: IMAGE_TEXT,
    base64: MOCK_IMAGE_PNG_BASE64,
    mediaType: IMAGE_MEDIA_TYPE,
  });

const useScenario = (reply: ChatReply | (() => ChatReply)) =>
  gateway.use({ chat: typeof reply === "function" ? () => reply() : () => reply });

/** The recorded `POST /v1/chat/completions` bodies of one scenario. */
const chatBodies = (scenario: { requests: { path: string; body: unknown }[] }): ChatRequest[] =>
  scenario.requests
    .filter((request) => request.path === "/v1/chat/completions")
    .map((request) => request.body as ChatRequest);

describe("generateImages over the Gateway HTTP seam", () => {
  it("requests the image contract and turns the response's image part into a GeneratedFile", async () => {
    const scenario = await useScenario(imageResponse());

    const files = await generateImages(editionMessage);

    expect(files).toHaveLength(1);
    const [file] = files;
    expect(file!.mediaType).toBe(IMAGE_MEDIA_TYPE);
    expect(file!.base64).toBe(MOCK_IMAGE_PNG_BASE64);
    // The same bytes are exposed in both GeneratedFile representations.
    expect(Buffer.from(file!.uint8Array).toString("base64")).toBe(MOCK_IMAGE_PNG_BASE64);

    const bodies = chatBodies(scenario);
    expect(bodies).toHaveLength(1);
    const [body] = bodies;

    // Contract selection and the modalities pinned by the image contract.
    expect(body!.model).toBe(IMAGE_CONTRACT);
    expect(body!.modalities).toEqual(["image", "text"]);
    // Catalog metadata of the contract reaches the wire unchanged.
    expect(body!.temperature).toBe(0.6);

    const [system, user] = body!.messages ?? [];
    expect(system!.role).toBe("system");
    expect(String(system!.content)).toContain("expert photo editing assistant");
    // The attachment travels as an `image_url` data URL next to the prompt.
    expect(user).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Brighten this image" },
        { type: "image_url", image_url: { url: IMAGE_DATA_URL } },
      ],
    });
  });

  it("returns no files when the reply carries no image part", async () => {
    await useScenario(textReply("I could not edit that image."));

    const files = await generateImages(editionMessage);

    // Empty is silent at this layer: the route retries and the UI shows the
    // emptiness, so a missing image must never be reported as a generated file.
    expect(files).toEqual([]);
  });

  it("propagates a Gateway error instead of returning files", async () => {
    await useScenario(() => {
      throw new GatewayScenarioError("image generation rejected", 400);
    });

    await expect(generateImages(editionMessage)).rejects.toThrow(
      "Image generation request failed: 400",
    );
  });
});
