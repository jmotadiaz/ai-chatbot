import { generateObject, GenerateObjectResult, streamText } from "ai";
import { z } from "zod";
import { languageModelConfigurations } from "@/lib/ai/providers";

const sourceLanguages = ["Spanish", "English"] as const;
const targetLanguages = ["Spanish (Spain)", "English (UK)"] as const;
const audiences = [
  "general_public",
  "internal_stakeholders",
  "internal_team",
  "partners",
  "executives_or_investors",
] as const;

const getObject = <T>({ object }: GenerateObjectResult<T>) => object;

export default async function translate(prompt: string) {
  // Determine target language
  const translationDirectionResult = generateObject({
    ...languageModelConfigurations["Llama 3.1 Instant"],
    schema: z.object({
      sourceLanguage: z.enum(sourceLanguages),
      targetLanguage: z.enum(targetLanguages),
    }),
    system:
      "You are an expert detecting the language of a text. You should determine the target language for translation based on the content provided. If the text is already in English, translate it to Spanish (Spain). If it's in Spanish, translate it to English (UK).",
    prompt: `Determine the target language for translation based on the following text:
    ${prompt}`,
  })
    .then(getObject)
    .catch((error) => {
      console.error("Error determining translation direction:", error);
      return {
        sourceLanguage: "",
        targetLanguage: "English (UK)",
      } as const;
    });

  const audienceResult = generateObject({
    ...languageModelConfigurations["Llama 3.1 Instant"],
    schema: z.object({
      audience: z.enum(audiences),
    }),
    system: "You are an expert detecting the audience of a text.",
    prompt: `Identify the most likely target audience for the following text:
    ${prompt}`,
  })
    .then(getObject)
    .catch((error) => {
      console.error("Error determining audience:", error);
      return { audience: "general_public" } satisfies {
        audience: (typeof audiences)[number];
      };
    });

  const domainResult = generateObject({
    ...languageModelConfigurations["Llama 3.1 Instant"],
    schema: z.object({
      domain: z.string(),
      subdomain: z.string(),
    }),
    system: `You are an expert detecting the main domain or context of a text. Be as specific as possible.
      Respond with the keys "domain" (e.g., "legal", "medical", "technology", "marketing", "academic") and "subdomain" (e.g., "contracts", "cardiology", "web_development", "seo", "quantum_physics")`,
    prompt: `Identify the main domain or context for the following text:
    ${prompt}`,
  })
    .then(getObject)
    .catch((error) => {
      console.error("Error determining domain:", error);
      return { domain: "unknown", subdomain: "unknown" } as const;
    });

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
      - Preserve the original formatting (paragraphs, lists, etc.) whenever possible.
    `,
    prompt: `Translate the following text from ${sourceLanguage} to ${targetLanguage}: ${prompt}`,
  });
}

const audienceInstructions = {
  internal_stakeholders:
    "The translation must be professional, clear, and respectful. While it's an internal communication, maintain a higher level of formality than when speaking to direct peers. Contractions (e.g., 'it's', 'we're') are acceptable for a natural flow, but avoid slang. The goal is to inform efficiently and build cross-functional alignment.",
  internal_team:
    "The translation is for direct team members. A more direct, conversational, and efficient tone is preferred. It's acceptable to use well-known internal acronyms and technical jargon if the knowledge level is 'technical' or 'expert'. The goal is operational clarity and speed.",
  executives_or_investors:
    "The translation must be formal, professional, and concise. The language should be polished and focused on business impact, metrics, and outcomes. Avoid colloquialisms, slang, and overly detailed technical jargon. Use a respectful and confident tone.",
  general_public:
    "Use simple, clear, and engaging language. The goal is maximum readability and public understanding.",
  partners:
    "Use a professional, collaborative, and clear tone. The language should foster a strong working relationship.",
} as const satisfies Record<(typeof audiences)[number], string>;
