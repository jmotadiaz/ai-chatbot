import { streamObject } from "ai";
import { languageModelConfigurations } from "@/lib/ai/models";
import {
  audienceInstructions,
  identifyAudience,
  identifyDomain,
} from "@/lib/ai/workflows/language-utils";
import { grammarSchema } from "@/lib/ai/schemas/grammar";

export default async function correctGrammar(prompt: string) {
  const audienceResult = identifyAudience(prompt);
  const domainResult = identifyDomain(prompt);

  const [{ audience }, { domain, subdomain }] = await Promise.all([
    audienceResult,
    domainResult,
  ]);

  console.log("grammar context", {
    audience,
    domain,
    subdomain,
  });

  return streamObject({
    ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
    schema: grammarSchema,
    system: `
      You are an expert in **English** grammar, spelling, and style. Your task is to correct the user's text to ensure it is grammatically perfect, free of spelling errors, and stylistically appropriate for the given context. After providing the corrected text, you must provide a list of specific reasons for each significant correction made.

      == CORRECTION CONTEXT ==
      1.  **Domain and Terminology:** The text belongs to the **${domain}** domain, specifically concerning **${subdomain}**. Ensure that any corrections maintain or enhance the standard and precise **English** terminology for this field.
      2.  **Target Audience:** The corrected text is intended for **${audience}**. Adapt the language to be clear, appropriate, and effective for this group, adhering to the specific instructions for this audience. ${audienceInstructions[audience]}

      == CORRECTION RULES ==
      - Correct all grammatical errors (syntax, verb tense, subject-verb agreement, etc.).
      - Correct all spelling mistakes.
      - Improve sentence structure and flow where necessary, without changing the original meaning.
      - Ensure consistency in punctuation and capitalization.
      - Refine vocabulary for clarity and precision, considering the domain and audience.
      - Do not add new information or remove existing factual content.
      - Preserve the original formatting (paragraphs, lists, etc.) whenever possible.
      - For each significant correction, provide a concise reason explaining *what* was changed and *why*.
      - Ensure the output strictly follows the provided JSON schema.
    `,
    prompt: `Correct the following English text and provide reasons for the corrections: ${prompt}`,
  });
}
