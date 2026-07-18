import { generateObject, streamObject, streamText } from "ai";
import { z } from "zod";
import type { CorrectGrammarAiPort, TranslateAiPort } from "./ports";
import {
  audienceInstructions,
  buildGuardrailPrompt,
  zodToPrompt,
  audiences,
  sourceLanguages,
  targetLanguages,
} from "./utils";
import { grammarSchema } from "./schemas";
import type { ModelConfiguration } from "@/lib/features/foundation-model/types";

// ─── Classification schemas ──────────────────────────────────────────────────

const audienceSchema = z.object({
  audience: z.enum(audiences),
});

const domainSchema = z.object({
  domain: z.string().describe("Domain of the text."),
  subdomain: z.string().describe("Subdomain of the text."),
});

const translationDirectionSchema = z.object({
  sourceLanguage: z.enum(sourceLanguages),
  targetLanguage: z.enum(targetLanguages),
});

// ─── Classification helpers ──────────────────────────────────────────────────

const classifyAudience = (config: ModelConfiguration, prompt: string) =>
  generateObject({
    ...config,
    schema: audienceSchema,
    system: `
      Role: Communications Analyst
      Task: Classify the most likely target audience for the provided text.

      Categories:
      - "general public": Public-facing, simple language.
      - "professionals": Cross-departmental colleagues. Moderate formality, structured.
      - "internal team": Immediate team. Informal, chat-like, uses heavy technical jargon/acronyms.
      - "partners": External business partners. Collaborative.
      - "executives or investors": Formal, polished, business-metric focused.

      ${zodToPrompt(audienceSchema)}
    `,
    prompt: `Text:\n${prompt}`,
  })
    .then((r) => r.object)
    .catch((error) => {
      console.error("Error determining audience:", error);
      return { audience: "general public" as const };
    });

const classifyDomain = (config: ModelConfiguration, prompt: string) =>
  generateObject({
    ...config,
    schema: domainSchema,
    system: `
      Role: Content Classifier
      Task: Identify the specific domain and subdomain of the provided text.
      Instructions: Be highly specific (e.g., Domain: Software Engineering, Subdomain: React Frontend Development).
      ${zodToPrompt(domainSchema)}
    `,
    prompt: `Text:\n${prompt}`,
  })
    .then((r) => r.object)
    .catch((error) => {
      console.error("Error determining domain:", error);
      return { domain: "unknown", subdomain: "unknown" } as const;
    });

const detectTranslationDirection = (
  config: ModelConfiguration,
  prompt: string,
) =>
  generateObject({
    ...config,
    schema: translationDirectionSchema,
    system: `
      Role: Translation Language Detector
      Task: Determine the target language for translation based on the provided text's source language.
      Rule 1: If source is English -> Target is Spanish (Spain)
      Rule 2: If source is Spanish -> Target is English (UK)
      Rule 3: Default to English (UK) target if unsure.
      ${zodToPrompt(translationDirectionSchema)}
    `,
    prompt: `Text:\n${prompt}`,
  })
    .then((r) => r.object)
    .catch((error) => {
      console.error("Error determining translation direction:", error);
      return {
        sourceLanguage: "" as string,
        targetLanguage: "English (UK)" as string,
      };
    });

// ─── Factories ────────────────────────────────────────────────────────────────

export const makeCorrectGrammar =
  (ai: CorrectGrammarAiPort) => async (prompt: string) => {
    const [{ audience }, { domain, subdomain }] = await Promise.all([
      classifyAudience(ai.getAudienceModelConfiguration(), prompt),
      classifyDomain(ai.getDomainModelConfiguration(), prompt),
    ]);

    console.log("grammar context", { audience, domain, subdomain });

    return streamObject({
      ...ai.getGrammarModelConfiguration(),
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
  };

export const makeTranslate =
  (ai: TranslateAiPort) => async (prompt: string) => {
    const [
      { sourceLanguage, targetLanguage },
      { audience },
      { domain, subdomain },
    ] = await Promise.all([
      detectTranslationDirection(ai.getDirectionModelConfiguration(), prompt),
      classifyAudience(ai.getAudienceModelConfiguration(), prompt),
      classifyDomain(ai.getDomainModelConfiguration(), prompt),
    ]);

    console.log("translation context", {
      sourceLanguage,
      targetLanguage,
      audience,
      domain,
      subdomain,
    });

    return streamText({
      ...ai.getTranslateModelConfiguration(),
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
  };
