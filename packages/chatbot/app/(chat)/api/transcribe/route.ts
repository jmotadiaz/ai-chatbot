import { transcribeAudio } from "@/lib/features/speech-to-text/actions";
import { withAuth } from "@/lib/features/auth/with-auth/handler";

// Speech-to-text BFF endpoint. The client streams the microphone in short
// segments; each segment is POSTed here as multipart/form-data, transcribed,
// and the resulting text is returned so the client can append it to the
// textarea. Only text ever reaches the coding-agent worker.
export const POST = withAuth(async (_user, req) => {
  try {
    const form = await req.formData();
    const audio = form.get("audio");

    if (!(audio instanceof Blob)) {
      return new Response("Missing audio", { status: 400 });
    }

    const bytes = new Uint8Array(await audio.arrayBuffer());
    if (bytes.byteLength === 0) {
      return Response.json({ text: "" });
    }

    const { text } = await transcribeAudio(bytes);
    return Response.json({ text });
  } catch (error) {
    console.error("Error transcribing audio:", error);
    return new Response("Error transcribing audio", { status: 500 });
  }
});
