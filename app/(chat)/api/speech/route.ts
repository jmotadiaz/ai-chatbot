import { generateSpeech } from "@/lib/features/english/actions";
import { withAuth } from "@/lib/features/auth/with-auth/handler";

export const POST = withAuth(async (_user, req) => {
  const { input } = await req.json();

  try {
    const result = await generateSpeech(input);
    return Response.json(result);
  } catch (error) {
    console.error("Error generating speech:", error);
    return new Response("Error generating speech", { status: 500 });
  }
});
