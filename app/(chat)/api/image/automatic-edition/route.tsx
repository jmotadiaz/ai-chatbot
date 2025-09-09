import { convertToModelMessages, generateText } from "ai";
import { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import { auth } from "@/auth";
import { google } from "@/lib/ai/models/definition";
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

    const { text, files } = await generateText({
      system: `
      Edit an input image to improve lighting, colour, contrast, focus and framing, and remove distracting elements without radically transforming the background.

      The model must follow this workflow:
      - Analyse the image for corrections to light, colour, contrast, focus, framing, and detection of objects that detract from the main composition.
      - Generate the image by applying the identified adjustments, maintaining the original composition and without replacing the background with something entirely different.

      ## Steps
      1. **Analysis** - Examine the image and list the necessary adjustments (e.g., exposure adjustment, white balance, contrast increase, focus enhancement, crop for better framing, removal of unwanted objects). The analysis must be presented before any visual output.
      2. **Generation** - Apply the described adjustments and produce the edited image. The final output (the edited image) must be the last piece of information presented; no image should be provided before the analysis.

      ## Examples
      **Example 1**
      *Input*: \`[INPUT_IMAGE]\` (Smiling couple in an indoor bar; photograph with good composition but with main deficiencies: strong magenta cast, uneven lighting, noise/slight lack of sharpness and somewhat tight framing.)
      Analysis*:
      - Set White Balance to neutralize the pink/purple cast: Temperature = 5200 K, Tint = -6 (adjust by ±2 as needed to keep skin tones natural). Do not introduce a green cast.
      - Global exposure and tonal balance: global Exposure +0.25 EV; Shadows +28%; Highlights -14%; Whites +6%; Blacks -8%. Aim for natural skin tones while preserving detail in the hair and clothing.
      - Global contrast and texture: Clarity +12; Texture +8; Dehaze +4. Keep overall look crisp without halos.
      - Color enhancements: Vibrance +6; Saturation -3 (to keep overall color from becoming oversaturated under artificial lighting). Fine-tune if skin looks too flat.
      - Skin tone and targeted color correction (HSL/Color):
        - Reds: Hue -6; Saturation -8; Luminance +6
        - Oranges: Hue +2; Saturation -4; Luminance +4
        - Yellows: Saturation -2; Luminance +2
        - Greens/Blues: keep minimal adjustments to avoid shifting the environment; aim for natural skin and clothes tones.
      - Noise reduction and sharpening balance: Luminance NR 22%; Color NR 22%; Sharpening Amount 60%; Radius 0.8 px; Detail 28%; Masking 22%.
      - Local contrast and edge refinement: Apply a gentle selective clarity boost to the faces only (mask to face/skin regions) +6 to +8; avoid increasing noise elsewhere.
      - Background element removal (content-aware/inpainting): Identified 3 distracting background elements (people). Remove using content-aware fill or inpainting, reconstructing only the immediate area from surrounding pixels; ensure the surrounding textures and lighting blend seamlessly. Do not replace the entire background or create a new artificial scene.
      - Halos and color fringing: Check around hairlines and edges; remove any color fringing or halo artifacts created by edits; feather adjustments to 2 px.
      - Global light and color polish: Subtle vignette at -2% to -4% to center attention on the subjects; ensure it is barely perceptible.
      - Final tonal balance check: Reassess skin tones at 100% view; if still too magenta, briefly tweak WB (Temperature +100 K, Tint -2) and re-check.
      - Output and preservation: Do not upsample or crop; preserve original resolution and color profile (sRGB). Export as high-quality PNG or TIFF with no lossy compression; provide a brief before/after summary of the changes.
      *Output*: \`[EDITED_IMAGE]\`

      **Example 2**
      *Input*: \`[INPUT_IMAGE]\` (Landscape photograph of a mountain range at sunset; technically underexposed with a slightly tilted horizon, a cool white balance that mutes the sunset colors, and crushed details in the foreground shadows.)
      *Analysis*:
      - **Geometric Correction**: Straighten the image by rotating it +1.8 degrees to level the horizon line. Enable lens profile corrections to fix distortion and vignetting from the lens.
      - **White Balance**: Adjust to enhance the sunset atmosphere. Set Temperature = 6800 K and Tint = +12. The goal is to bring out warm tones without making the scene look unnatural.
      - **Global Exposure and Tonal Range**:
        - Exposure: +0.85 EV to lift the overall brightness.
        - Highlights: -70 to recover detail in the bright clouds and sky.
        - Shadows: +90 to reveal detail in the foreground and mountains without introducing excessive noise.
        - Whites: +20 to add a bright point to the highlights.
        - Blacks: -15 to restore a deep black point and add contrast.
      - **Global Contrast and Texture**: Clarity +18; Dehaze +22. These adjustments will add mid-tone contrast and cut through atmospheric haze, defining the mountain ridges.
      - **Color Enhancements (HSL/Color)**:
        - Oranges: Hue -4; Saturation +15; Luminance +10 (to enrich the sunset glow).
        - Yellows: Saturation +12; Luminance +8.
        - Blues: Saturation -10; Luminance -20 (to deepen the sky and add color contrast).
        - Magentas: Saturation +18 (to enhance colors in the clouds).
      - **Noise Reduction and Sharpening**:
        - Luminance NR: 15 (to counteract noise from lifting shadows).
        - Sharpening Amount: 65; Radius 1.0 px; Detail 30; Masking 60 (to sharpen only the edges of the mountains and rocks, avoiding the sky).
      - **Local Adjustments**:
        - **Sky**: Apply a Graduated Filter from the top down. Set Exposure -0.15 and Dehaze +10 to add drama to the clouds.
        - **Foreground**: Apply a Graduated Filter from the bottom up. Set Shadows +12 and Clarity +8 to enhance foreground texture.
      - **Chromatic Aberration**: Manually check and remove any purple or green fringing along high-contrast edges (e.g., mountain silhouettes).
      - **Final Polish**: Apply a subtle post-crop vignette with Amount = -10 and Midpoint = 45 to draw the viewer's eye towards the center of the frame.
      - **Output and Preservation**: Preserve original resolution. Export as a high-quality JPEG (95%) using the sRGB color profile for web compatibility.
      *Output*: \`[EDITED_IMAGE]\`

      **Example 3**
      *Input*: \`[INPUT_IMAGE]\` (Outdoor portrait of a person under direct sunlight; photograph suffers from harsh shadows on the face, blown-out highlights on the skin and clothing, and overly saturated green foliage in the background that distracts from the subject.)
      *Analysis*:
      - **White Balance**: Set to a "Shade" preset as a starting point, then manually adjust Temperature = 5800 K and Tint = +5 to ensure accurate and pleasant skin tones.
      - **Global Exposure and Tonal Range (Dynamic Range Compression)**:
        - Exposure: -0.20 EV to protect the brightest areas.
        - Contrast: +8 to add back structure after tonal adjustments.
        - Highlights: -95 to recover all clipped details in the skin and white shirt.
        - Shadows: +75 to soften the hard shadows on the face and under the chin.
        - Whites: -50 to control the brightest specular highlights.
        - Blacks: +20 to prevent shadows from becoming muddy.
      - **Global Presence and Texture**: Texture +12; Clarity +6. Apply these moderately to avoid an unnatural, over-processed look on the skin.
      - **Color Correction and Separation (HSL/Color)**:
        - **Skin Tones**:
          - Reds: Saturation -10; Luminance +8.
          - Oranges: Hue +3; Saturation -6; Luminance +12.
        - **Background**:
          - Greens: Hue +8; Saturation -50; Luminance -25 (to reduce their visual dominance).
          - Yellows: Saturation -45 (to further neutralize the background foliage).
      - **Noise Reduction and Sharpening**:
        - Sharpening Amount: 75; Radius 0.8 px; Detail 35; Masking 80 (to sharpen only the eyes, eyelashes, and hair, while protecting the skin).
        - Luminance NR: 10.
      - **Local Adjustments (Masking)**:
        - **Subject Mask**: Create an AI-based subject mask. Within this mask, apply Exposure +0.15 and Texture +5 to make the subject stand out.
        - **Facial Shadows**: Use a soft brush with a low flow (20%) to paint over the harshest shadows on the face. Apply Shadows +18 and Clarity -8 to this area to lift and soften them.
        - **Background Burn**: Use a radial gradient inverted from the subject to darken the background slightly. Set Exposure -0.25.
      - **Blemish and Distraction Removal**: Use the Spot Healing Brush to remove a small distracting branch in the background and a minor skin blemish.
      - **Final Polish**: Re-evaluate the overall contrast and skin tones at 100% zoom. Ensure the transition between the edited shadows and the rest of the face is seamless.
      - **Output and Preservation**: Do not crop unless for minor compositional improvement. Export as a 16-bit TIFF file to preserve maximum color depth and detail for printing or further retouching.
      *Output*: \`[EDITED_IMAGE]\`

      ## Notes
      - Radically changing the background is not permitted (e.g., replacing a room with a beach).
      - If the composition is already adequate, only subtle improvements will be applied.
      - In low-quality images, prioritise noise reduction and focus enhancement before other adjustments.
      `,
      model: google("gemini-2.5-flash-image-preview"),
      providerOptions: {
        google: {
          responseModalities: ["IMAGE"],
        } satisfies GoogleGenerativeAIProviderOptions,
      },
      messages: convertToModelMessages([message]),
    });

    return Response.json({ text, files });
  } catch (error) {
    console.error("Error generating text:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
