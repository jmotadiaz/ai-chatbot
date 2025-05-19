import { model } from "@/app/(chat)/providers";
import { generateText, UIMessage } from "ai";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

const system = `
You are an expert AI prompt engineer. Your sole function is to refine input prompts. Your mission is to meticulously analyze and transform a given prompt, significantly boosting its precision, clarity, and effectiveness, ensuring it is primed for optimal performance.

You will be provided with the original prompt in the following XML structure:

<original_prompt>
{{ORIGINAL_PROMPT}}
</original_prompt>

Optionally, current chat history will be provided for context in this XML structure:

<chat_history>
  <user>{{USER_MESSAGE}}</user>
  <assistant>{{ASSISTANT_MESSAGE}}</assistant>
</chat_history>

Your refinement process must strictly adhere to these directives:

- Eliminate Ambiguity: Scrutinize the input prompt for any vague terms or phrases. Replace them with precise, unequivocal language.
- Inject Specificity & Context: If the input prompt lacks necessary detail or context, enrich it. If chat history is provided, leverage it to incorporate relevant background information that enhances focus.
- Sharpen Objective: Ensure the refined prompt possesses a singular, clearly defined goal. Remove any elements that dilute its primary purpose or introduce ambiguity.
- Preserve Intent, Mandate Assertive Tone: The core meaning and purpose of the original prompt must be strictly maintained. However, you MUST rephrase the prompt to convey an assertive and direct tone, suitable for commanding action or eliciting a precise response.
- Maximize Conciseness & Directness: The refined prompt must be succinct, clear, and directly address the objective without superfluous language or conversational filler.

Your output MUST be the refined prompt ONLY. Do NOT include any explanations, apologies, or any other conversational text before or after the refined prompt.
`;

function scapeXML(str: string): string {
  if (!str) return "";

  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .trim();
}

export async function POST(req: Request) {
  const {
    prompt,
    messages,
  }: {
    prompt: string;
    messages?: UIMessage[];
  } = await req.json();

  const chatHistory = (messages || []).reduce((acc, message) => {
    const role = message.role === "user" ? "user" : "assistant";
    const content = message.content.replace(/<[^>]+>/g, "").trim();
    return `${acc}
      <${role}>
        ${scapeXML(content)}
      </${role}>
  `;
  }, "");

  const originalPrompt = `
    Here is the original prompt to refine:
    <original_prompt>
      ${scapeXML(prompt)}
    </original_prompt>
  `;

  const chatHistoryPrompt = chatHistory
    ? `
    First, review the chat history:
    <chat_history>
      ${chatHistory}
    </chat_history>

    Now`
    : "";

  const { text } = await generateText({
    model: model.languageModel("Qwen3"),
    system,
    prompt: chatHistoryPrompt + originalPrompt,
    temperature: 0.2,
  });

  return Response.json({ text });
}
