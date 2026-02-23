import { streamObject, streamText } from "ai";
import {
  audienceInstructions,
  buildGuardrailPrompt,
  identifyAudience,
  identifyDomain,
  identifyTranslationDirection,
} from "./utils";
import { grammarSchema } from "./schemas";
import { languageModelConfigurations } from "@/lib/features/foundation-model/config";

export async function correctGrammar(prompt: string) {
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
    ...languageModelConfigurations("Gemini 2.5 Flash"),
    schema: grammarSchema,
    system: `
      You are an expert in **English** grammar, spelling, and style. Your task is to correct the user's text to ensure it is grammatically perfect, free of spelling errors, and stylistically appropriate for the given context. After providing the corrected text, you must provide a list of specific reasons for each significant correction made.

      == CORRECTION CONTEXT ==
      **Domain/Terminology:** ${domain} - ${subdomain}. Maintain precise English terminology for this field.
      **Target Audience:** ${audience}
      ${audienceInstructions[audience]}

      == CORRECTION RULES ==
      - Correct all grammatical errors, syntax, verb tense, and subject-verb agreement.
      - Correct all spelling mistakes.
      - Improve sentence structure and flow where necessary, without changing original meaning.
      - Ensure consistency in punctuation and capitalization.
      - Refine vocabulary for clarity/precision matching the domain and audience.
      - Do not add new information or remove existing factual content.
      - For each significant correction, provide a concise reason explaining *what* was changed and *why*.

      ${buildGuardrailPrompt("correct the grammar and spelling of the entire user message as-is")}
    `,
    prompt,
  });
}

export async function translate(prompt: string) {
  const translationDirectionResult = identifyTranslationDirection(prompt);
  const audienceResult = identifyAudience(prompt);
  const domainResult = identifyDomain(prompt);

  const [
    { sourceLanguage, targetLanguage },
    { audience },
    { domain, subdomain },
  ] = await Promise.all([
    translationDirectionResult,
    audienceResult,
    domainResult,
  ]);

  console.log("translation context", {
    sourceLanguage,
    targetLanguage,
    audience,
    domain,
    subdomain,
  });

  // Translation
  return streamText({
    ...languageModelConfigurations("Gemini 2.5 Flash"),
    system: `
      You are an expert ${sourceLanguage} to ${targetLanguage} translator with native-level proficiency in both languages. Your task is to translate the user's text with the highest fidelity to the original, while adapting it to the specific context provided below.

      == TRANSLATION CONTEXT ==
      **Domain/Terminology:** ${domain} - ${subdomain}. Use standard target language terminology. Avoid translating domain-specific terms unless the text is a single word.
      **Target Audience:** ${audience}
      ${audienceInstructions[audience]}

      == OUTPUT RULES ==
      - Output ONLY the translated text.
      - No explanations, formatting, or commentary unless present in the original text.

      ${buildGuardrailPrompt(`translate the entire user message from ${sourceLanguage} to ${targetLanguage} as-is`)}
    `,
    prompt,
  });
}
