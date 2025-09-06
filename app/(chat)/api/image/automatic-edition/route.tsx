import { convertToModelMessages, generateText } from "ai";
import { auth } from "@/auth";
import { google } from "@/lib/ai/models/definition";
import { ChatbotMessage } from "@/lib/ai/types";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const {
    message,
  }: {
    message: ChatbotMessage;
  } = await req.json();

  try {
    const { text, files } = await generateText({
      system: `
      # Auto-edit Prompt

      1.  Enhance sharpness and focus, applying a high-frequency filter that doesn't introduce noticeable noise.
      2.  Adjust exposure: increase brightness by 10%, reduce shadows by 8%, and lift detail in highlights while maintaining naturalness.
      3.  Correct white balance so colours appear neutral; remove any colour cast that distorts the scene.
      4.  Remove distracting background elements or objects (e.g., cables, unwanted people) using an object suppression algorithm.
      5.  Maintain original resolution and avoid any scaling that introduces visible pixels.

      Restrictions:
      -   Do not change the composition or position of the main subjects.
      -   Do not overexpose or darken areas that already have natural contrast.
      -   Do not introduce visible editing artefacts (smudges, halos, lines).

      Desired outcome: Final image in PNG format, resolution equal to the original, with the improvement applied automatically.
      `,
      model: google("gemini-2.5-flash-image-preview"),
      providerOptions: {
        google: { responseModalities: ["IMAGE"] },
      },
      messages: convertToModelMessages([message]),
    });

    return Response.json({ text, files });
  } catch (error) {
    console.error("Error generating text:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
