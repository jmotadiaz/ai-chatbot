import { convertToModelMessages, generateText } from "ai";
import { auth } from "@/auth";
import {
  google,
  languageModelConfigurations,
} from "@/lib/ai/models/definition";
import { ChatbotMessage } from "@/lib/ai/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const {
      message,
    }: {
      message: ChatbotMessage;
    } = await req.json();

    const messages = convertToModelMessages([message]);

    const { text: system } = await generateText({
      ...languageModelConfigurations["GPT 5 Nano"],
      system: `
      # Meta-Prompt: Image Enhancement Prompt Generation

      ## Role and Goal
      You are an expert image analysis AI. Your primary function is to act as a professional photo editor. You will receive an image as input and your goal is to generate a precise, technical, and actionable system prompt for an image enhancement model. This new system prompt should detail the specific steps required to improve the input image's overall quality.

      ## Analysis Criteria
      When analyzing the input image, you must critically evaluate the following technical aspects:
      - **Lighting and Exposure:** Assess brightness, contrast, shadows, highlights, and overall dynamic range.
      - **Color Accuracy:** Evaluate white balance, color saturation, vibrancy, and identify any unnatural color casts.
      - **Clarity and Focus:** Determine the level of sharpness, identify areas that are out of focus, and detect any digital noise or grain.
      - **Composition and Framing:** Analyze the framing, identify distracting background or foreground elements, and suggest improvements based on composition rules (e.g., rule of thirds, leading lines).
      - **Element Removal and Background Integrity:** Identify non-essential or distracting elements for removal. **Specify that their removal must be performed using techniques like content-aware fill or inpainting, which reconstruct the immediate area based on surrounding pixels. This process must not replace or generate a new background, but rather seamlessly integrate the removal into the existing environment.**
      - **Technical Integrity:** Check for issues like compression artifacts, lens distortion, or chromatic aberration.

      ## Output Instructions
      Based on your analysis, generate a new prompt that consists of a **numbered list** of instructions. Each instruction must be:
      - **Specific:** Clearly state the action to be taken.
      - **Technical:** Use precise terminology related to photo editing.
      - **Quantifiable:** Use percentages or specific values where applicable to avoid ambiguity.
      - **Actionable:** Each step should be an executable command for an image processing tool or AI.
      - **Focused on Preservation:** Instructions should aim to maintain the original resolution and avoid introducing new artifacts.

      ## Task
      Analyze the provided image and generate the enhancement system prompt according to all the rules specified above.
      `,
      messages,
    });

    const { text, files } = await generateText({
      system,
      model: google("gemini-2.5-flash-image-preview"),
      providerOptions: {
        google: { responseModalities: ["IMAGE"] },
      },
      messages,
    });

    return Response.json({ text, files });
  } catch (error) {
    console.error("Error generating text:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
