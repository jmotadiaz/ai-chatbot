import { openrouter } from "../../providers";
import { generateText, UIMessage } from "ai";

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
   - Zero-shot: Suited for straightforward tasks that the model can understand and perform correctly without needing explicit examples in the prompt.
   - Few-shot: Ideal for tasks where providing a few illustrative examples within the prompt helps to clarify the expected output format, style, or how to handle nuanced instructions.
   - Chain of Thought (CoT): Apply to complex reasoning tasks where eliciting a step-by-step thought process from the model is crucial for arriving at an accurate solution (e.g., arithmetic, symbolic reasoning, or multi-hop question answering).
   - Role-prompting: For tasks benefiting from the model assuming a specific persona or role. This is especially useful for content creation or engagement-focused interactions to align the model's response with the desired tone and style. Do NOT use this technique when chat_history is provided.

3. Refine the prompt using the selected technique and incorporating best practices:
   - Provide clear and specific instructions
   - Break down complex tasks into smaller steps
   - Include relevant context or background information
   - Use appropriate formatting for clarity. For any listed items, avoid numbering to facilitate easier editing and reordering.
   - Maintain the original language of the prompt

4. Review and adjust the refined prompt to ensure it:
   - Adheres to the chosen prompt engineering technique
   - Maintains the original objective
   - Avoids redundant or unnecessary information
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
    model: openrouter.chat("openai/o4-mini-high"),
    system,
    prompt: initialPrompt + originalPrompt,
    temperature: 0.2,
  });

  return Response.json({ text });
}
