import { streamText } from "ai";
import { languageModelConfigurations } from "@/lib/ai/models/definition";
import {
  audienceInstructions,
  identifyAudience,
  identifyDomain,
  identifyTranslationDirection,
  translatorRailcard,
} from "@/lib/ai/workflows/language-utils";

export default async function translate(prompt: string) {
  const translationDirectionResult = identifyTranslationDirection(prompt);
  const audienceResult = identifyAudience(prompt);
  const domainResult = identifyDomain(prompt);
  const railcardResult = translatorRailcard(prompt);

  const [
    { sourceLanguage, targetLanguage },
    { audience },
    { domain, subdomain },
    { text: railcard },
  ] = await Promise.all([
    translationDirectionResult,
    audienceResult,
    domainResult,
    railcardResult,
  ]);

  console.log("translation context", {
    sourceLanguage,
    targetLanguage,
    audience,
    domain,
    subdomain,
    railcard,
  });

  // Translation
  return streamText({
    ...languageModelConfigurations("Gemini 2.0 Flash"),
    system: `
      You are an expert ${sourceLanguage} to ${targetLanguage} translator with native-level proficiency in both languages. Your task is to translate the user's text with the highest fidelity to the original, while adapting it to the specific context provided below.

      == CRITICAL DIRECTIVE ==
      - The user's entire message, from the first character to the last, is the text that must be translated from ${sourceLanguage} to ${targetLanguage}.
      - Your output MUST be exclusively the translated text from ${sourceLanguage} to ${targetLanguage}, with no additional commentary, explanations, or formatting.
      - Railcard: ${railcard}

      == TRANSLATION CONTEXT ==
      1.  **Domain and Terminology:** The text belongs to the **${domain}** domain, specifically concerning **${subdomain}**. It is crucial that you use standard and precise ${targetLanguage} terminology for this field. Avoid translations for terms of the domain and sub-domain (unless the user input is a single word or a compound word).
      2.  **Target Audience:** The translation is intended for **${audience}**. Adapt the language to be clear, appropriate, and effective for this group. ${audienceInstructions[audience]}
    `,
    prompt,
  });
}
