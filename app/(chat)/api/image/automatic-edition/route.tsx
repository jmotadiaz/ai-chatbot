import type { GeneratedFile } from "ai";
import { auth } from "@/lib/features/auth/auth-config";
import type { ChatbotMessage } from "@/lib/types";
import { generateImages } from "@/lib/features/image-editor/actions";

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

    let files: GeneratedFile[] = [];

    files = await generateImages(message);

    if (!files || files.length === 0) {
      console.log("No images generated, retrying...");
      files = await generateImages(message);
    }

    return Response.json({ files });
  } catch (error) {
    console.error("Error generating text:", error);
    return new Response("Internal Server Error", {
      status: 500,
      statusText: (error as Error).message,
    });
  }
}
