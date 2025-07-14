import { streamText } from "ai";
import { languageModelConfigurations } from "@/lib/ai/models";
import {
  audienceInstructions,
  identifyAudience,
  identifyDomain,
  identifyTranslationDirection,
} from "@/lib/ai/workflows/language-utils";

export default async function translate(prompt: string) {
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
    ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
    system: `
      You are an expert ${sourceLanguage} to ${targetLanguage} translator with native-level proficiency in both languages. Your task is to translate the user's text with the highest fidelity to the original, while adapting it to the specific context provided below.

      == TRANSLATION CONTEXT ==
      1.  **Domain and Terminology:** The text belongs to the **${domain}** domain, specifically concerning **${subdomain}**. It is crucial that you use standard and precise ${targetLanguage} terminology for this field. Avoid literal translations of technical terms.
      2.  **Target Audience:** The translation is intended for **${audience}**. Adapt the language to be clear, appropriate, and effective for this group. ${audienceInstructions[audience]}

      == ADDITIONAL RULES ==
      - Do not add information that is not present in the original text.
      - Do a grammatical and spelling check of the translation.
      - When translating, aim to use a diverse vocabulary by incorporating synonyms for repeated words or phrases.
      - Preserve the original formatting (paragraphs, lists, etc.) whenever possible.
    `,
    prompt: `Translate the following text from ${sourceLanguage} to ${targetLanguage}: ${prompt}`,
  });
}
