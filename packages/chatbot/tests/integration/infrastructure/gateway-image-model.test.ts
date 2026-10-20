import { describe, expect, it } from "vitest";
import { generateText } from "ai";
import { warmModelCatalog } from "@/lib/infrastructure/ai/catalog";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";
import { IMAGE_MEDIA_TYPE } from "@/lib/infrastructure/ai/gateway-image-model";
import { MOCK_IMAGE_PNG_BASE64 } from "@/tests/mocks/gateway/server";

/**
 * Integración del contrato `image-default` contra el Mock Model Gateway real
 * (HTTP, el mismo que sirve la suite): `generateImages` (`generateText` +
 * `inferenceKit.languageModel("image-default")`) debe producir un
 * `GeneratedFile` de imagen — el bug de la revisión era que el transport
 * genérico devolvía `files: []` porque no parsea las partes `image_url`.
 */

describe("image-default vía el Mock Model Gateway", () => {
  it("languageModel('image-default') devuelve el transport de imagen y generateText produce un GeneratedFile", async () => {
    await warmModelCatalog();

    const { files, text } = await generateText({
      ...inferenceKit.languageModel("image-default"),
      prompt: "Brighten this image",
    });

    expect(text).toBe("Enhanced image (mock).");
    expect(files).toHaveLength(1);
    const file = files[0]!;
    expect(file.mediaType).toBe(IMAGE_MEDIA_TYPE);
    // `GeneratedFile` expone los bytes; el PNG del mock es el de 1×1.
    expect(file.base64).toBe(MOCK_IMAGE_PNG_BASE64);
  });
});
