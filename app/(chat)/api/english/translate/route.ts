import { auth } from "@/lib/features/auth/auth-config";
import translate from "@/lib/ai/workflows/translate";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { prompt }: { prompt: string } = await req.json();

  const result = await translate(prompt);

  return result.toUIMessageStreamResponse();
}
