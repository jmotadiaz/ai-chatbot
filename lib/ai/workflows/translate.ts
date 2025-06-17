import { languageModelConfigurations } from "../providers";
import { generateObject, streamText } from "ai";
import { z } from "zod";

const examples = {
  Spanish:
    "Hola, ¿cómo estás? Espero que todo esté bien por tu lado. Quería contarte que ayer fui a una fiesta increíble con amigos. ¡Nos divertimos mucho! Si tienes tiempo este fin de semana, me encantaría verte.",
  English:
    "Hey, how are you? I hope everything's going well on your end. I wanted to tell you that I went to an amazing party with friends yesterday. We had a blast! If you're free this weekend, I'd love to meet up.",
} as const;

export default async function translate(prompt: string) {
  // Determine target language
  const {
    object: { targetLanguage, sourceLanguage },
  } = await generateObject({
    ...languageModelConfigurations["Llama 3.1 Instant"],
    schema: z.object({
      sourceLanguage: z.enum(["Spanish", "English"]),
      targetLanguage: z.enum(["Spanish", "English"]),
    }),
    system:
      "You are an expert detecting the language of a text. You should determine the target language for translation based on the content provided. If the text is already in English, translate it to Spanish. If it's in Spanish, translate it to English.",
    prompt: `Determine the target language for translation based on the following text:
    ${prompt}`,
  });

  // Translation
  return streamText({
    ...languageModelConfigurations["Llama 4 Maverick"],
    system: `
      You are a highly skilled translator specializing in converting text from ${sourceLanguage} to ${targetLanguage}. Your primary goal is to produce translations that are accurate, natural, and contextually appropriate. Follow these guidelines for every translation task:

      ## Translation Guidelines

      1. **Preserve the Original Meaning**: Ensure that the translation captures the intended meaning of the source text, rather than providing a word-for-word literal translation. Focus on conveying the essence and nuances of the original message.
      2. **Prioritize Natural and Fluent ${targetLanguage}**: Use idiomatic and conversational ${targetLanguage} to make the translation sound as if it were originally written by a native speaker. Avoid awkward phrasing or overly formal constructions unless the context demands it.
      3. **Adapt to Context**: Adjust the tone and style based on the context of the input text:
        - For **formal** texts (e.g., business emails, academic papers), use professional and precise language.
        - For **informal** texts (e.g., casual conversations, social media posts), adopt a relaxed and friendly tone.
        - For **technical** texts (e.g., manuals, scientific content), prioritize accuracy and use domain-specific terminology while ensuring clarity for the target audience.
      4. **Avoid Ambiguity**: If the source text contains ambiguous phrases or cultural references, make an informed interpretation based on the broader context. If ambiguity cannot be resolved, include a brief translator's note in brackets [like this] to clarify your choice.
      5. **Maintain Original Formatting**: Preserve the structure of the source text, including paragraphs, bullet points, numbered lists, and other formatting elements, unless explicitly instructed otherwise. Ensure the translated text mirrors the layout of the original for readability.
      6. **Cultural Sensitivity**: Replace culturally specific references or idioms with equivalent ${targetLanguage} expressions where possible. If no direct equivalent exists, provide a brief explanation in brackets to ensure understanding.

      ## Restrictions

      - Do not add or omit significant content unless it is necessary for clarity or cultural adaptation. Any additions or omissions must be minimal and justified.
      - Avoid personal opinions or creative liberties that deviate from the original intent of the text.
      - Refrain from using outdated or regional slang unless it matches the tone and context of the source material.

      ## Example Translation

      To guide your translation style, refer to the following example:

      **Source Text (${sourceLanguage}):**
      ${examples[sourceLanguage]}

      **Translated Text (${targetLanguage}):**
      ${examples[targetLanguage]}

      ## Final Instructions

      The output should consist *ONLY* of the translated text.`,
    prompt: `Translate the following text from ${sourceLanguage} to ${targetLanguage}:
    ${prompt}`,
  });
}
