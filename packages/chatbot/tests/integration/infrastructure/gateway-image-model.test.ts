import { describe, expect, it } from "vitest";
import { generateText } from "ai";
import { warmModelCatalog } from "@/lib/infrastructure/ai/catalog";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";
import { IMAGE_MEDIA_TYPE } from "@/lib/infrastructure/ai/gateway-image-model";
import { MOCK_IMAGE_PNG_BASE64 } from "@/tests/mocks/gateway/server";

/**
 * Integration of the `image-default` contract against the real Mock Model
 * Gateway (HTTP, the same one the suite is served by): `generateImages`
 * (`generateText` + `inferenceKit.languageModel("image-default")`) must produce
 * an image `GeneratedFile` — the review bug was that the generic transport
 * returned `files: []` because it does not parse the `image_url` parts.
 */

describe("image-default via the Mock Model Gateway", () => {
  it("languageModel('image-default') returns the image transport and generateText produces a GeneratedFile", async () => {
    await warmModelCatalog();

    const { files, text } = await generateText({
      ...inferenceKit.languageModel("image-default"),
      prompt: "Brighten this image",
    });

    expect(text).toBe("Enhanced image (mock).");
    expect(files).toHaveLength(1);
    const file = files[0]!;
    expect(file.mediaType).toBe(IMAGE_MEDIA_TYPE);
    // `GeneratedFile` exposes the bytes; the mock's PNG is the 1×1 one.
    expect(file.base64).toBe(MOCK_IMAGE_PNG_BASE64);
  });
});
