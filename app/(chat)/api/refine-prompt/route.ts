import { xai } from "../../providers";
import { generateText, UIMessage } from "ai";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

const system = `
You are an expert prompt engineer tasked with refining and improving prompts to adhere to best practices in prompt engineering. Your goal is to analyze the given prompt, select the most appropriate technique, and refine it to be more effective while maintaining its original language.

You will be provided with the original prompt in the following XML structure:

<original_prompt>
{{ORIGINAL_PROMPT}}
</original_prompt>

Optionally, current chat history will be provided for context in this XML structure:

<chat_history>
  <user>{{USER_MESSAGE}}</user>
  <assistant>{{ASSISTANT_MESSAGE}}</assistant>
</chat_history>

Follow these steps to complete the task:

1. Analyze the original prompt:
   - Identify the main objective or task
   - Determine the current structure and approach
   - Note any potential weaknesses or areas for improvement

2. Select the most appropriate prompt engineering technique based on the prompt's objective:
   - Zero-shot: For straightforward tasks that don't require examples
   - Few-shot: For tasks that benefit from examples to guide the model
   - Chain of Thought (CoT): For complex reasoning tasks that require step-by-step thinking
   - Role-prompting: For tasks that benefit from the model assuming a specific persona or role. Do NOT use this technique when chat_history is provided.

3. Refine the prompt using the selected technique and incorporating best practices:
   - Provide clear and specific instructions
   - Break down complex tasks into smaller steps
   - Include relevant context or background information
   - Use appropriate formatting (e.g., bullet points) for clarity. Do NOT use numbering to allow edit the prompt easily
   - Maintain the original language of the prompt

4. Review and adjust the refined prompt to ensure it:
   - Adheres to the chosen prompt engineering technique
   - Maintains the original objective
   - Is clear, concise, and effective

Your output MUST be the refined prompt ONLY. Do NOT include any explanations, apologies, or any other conversational text before or after the refined prompt. DO NOT include the refined prompt inside xml tags
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

  const initialPrompt = chatHistory
    ? `First, review the chat history:
    <chat_history>
      ${chatHistory}
    </chat_history>

    Now`
    : "";

  const { text } = await generateText({
    model: xai("grok-3"),
    system,
    prompt: initialPrompt + originalPrompt,
    temperature: 0.2,
  });

  return Response.json({ text });
}
