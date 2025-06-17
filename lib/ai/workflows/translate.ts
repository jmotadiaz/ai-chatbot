import { languageModelConfigurations } from "../providers";
import { generateText, generateObject } from "ai";
import { z } from "zod";

export default async function translate(text: string) {
  let currentTranslation = "";
  let iterations = 0;
  const MAX_ITERATIONS = 3;

  // Determine target language
  const {
    object: { targetLanguage },
  } = await generateObject({
    ...languageModelConfigurations["Llama 3.1 Instant"],
    schema: z.object({
      targetLanguage: z.enum(["Spanish", "English"]),
    }),
    system:
      "You are an expert detecting the language of a text. You should determine the target language for translation based on the content provided. If the text is already in English, translate it to Spanish. If it's in Spanish, translate it to English.",
    prompt: `Determine the target language for translation based on the following text:
    ${text}`,
  });

  // Initial translation
  const { text: translation } = await generateText({
    ...languageModelConfigurations["Llama 3.1 Instant"], // use small model for first attempt
    system: `
      You are an expert literary translator.
      The output should consist *ONLY* of the translated text.`,
    prompt: `Translate this text to ${targetLanguage}, preserving tone and cultural nuances:
    ${text}`,
  });

  currentTranslation = translation;

  // Evaluation-optimization loop
  while (iterations < MAX_ITERATIONS) {
    // Evaluate current translation
    const { object: evaluation } = await generateObject({
      ...languageModelConfigurations["Qwen 3"], // use a larger model to evaluate
      schema: z.object({
        qualityScore: z.number().min(1).max(10),
        preservesTone: z.boolean(),
        preservesNuance: z.boolean(),
        culturallyAccurate: z.boolean(),
        specificIssues: z.array(z.string()),
        improvementSuggestions: z.array(z.string()),
      }),
      system: "You are an expert in evaluating literary translations.",
      prompt: `Evaluate this translation:

      Original: ${text}
      Translation: ${currentTranslation}

      Consider:
      1. Overall quality [0 - 10]
      2. Preservation of tone
      3. Preservation of nuance
      4. Cultural accuracy`,
    });

    console.log("Evaluation:", evaluation);

    // Check if quality meets threshold
    if (
      evaluation.qualityScore >= 8 &&
      evaluation.preservesTone &&
      evaluation.preservesNuance &&
      evaluation.culturallyAccurate
    ) {
      break;
    }

    // Generate improved translation based on feedback
    const { text: improvedTranslation } = await generateText({
      ...languageModelConfigurations["Llama 3.1 Instant"],
      system: "You are an expert literary translator.",
      prompt: `Improve this translation based on the following feedback:
      ${evaluation.specificIssues.join("\n")}
      ${evaluation.improvementSuggestions.join("\n")}

      Original: ${text}
      Current Translation: ${currentTranslation}

      The output should consist *ONLY* of the translated text.`,
    });

    currentTranslation = improvedTranslation;
    iterations++;
  }

  return {
    translation: currentTranslation,
    iterationsRequired: iterations,
  };
}
