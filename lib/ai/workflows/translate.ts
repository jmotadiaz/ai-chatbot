import { generateObject, streamText } from "ai";
import { z } from "zod";
import { languageModelConfigurations } from "@/lib/ai/providers";

const languages = ["Spanish", "English"] as const;
type Languages = (typeof languages)[number];

export default async function translate(prompt: string) {
  // Determine target language
  const {
    object: { targetLanguage, sourceLanguage },
  } = await generateObject({
    ...languageModelConfigurations["Llama 3.1 Instant"],
    schema: z.object({
      sourceLanguage: z.enum(languages),
      targetLanguage: z.enum(languages),
    }),
    system:
      "You are an expert detecting the language of a text. You should determine the target language for translation based on the content provided. If the text is already in English, translate it to Spanish. If it's in Spanish, translate it to English.",
    prompt: `Determine the target language for translation based on the following text:
    ${prompt}`,
  });

  // Translation
  return streamText({
    ...languageModelConfigurations["Gemini 2.5 Flash Lite"],
    system: systemPrompt(targetLanguage, sourceLanguage),
    prompt: `Translate the following text from ${sourceLanguage} to ${targetLanguage}: ${prompt}`,
  });
}

const systemPrompt = (targetLanguage: Languages, sourceLanguage: Languages) => `
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

  To guide your translation style, refer to the following examples:

  ${examples.reduce((acc, example) => {
    return `${acc}
    ### ${example.exampleType}

    **Source Text (${sourceLanguage}):** ${example[sourceLanguage]}
    **Translated Text (${targetLanguage}):** ${example[targetLanguage]}\n
    `;
  }, "")}

  ## Final Instructions

  The output should consist *ONLY* of the translated text.`;

const examples = [
  {
    exampleType: "Formal passive request",
    English:
      "You are kindly requested to review the attached proposal at your earliest convenience.",
    Spanish:
      "Se le solicita amablemente que revise la propuesta adjunta a la mayor brevedad posible.",
  },
  {
    exampleType: "Informal comparative chat",
    English:
      "This new series is way better than the last one—you should totally binge-watch it!",
    Spanish:
      "Esta nueva serie es muchísimo mejor que la anterior; ¡deberías verla de corrido!",
  },
  {
    exampleType: "Idiomatic Expression and Common Vocabulary",
    English: "It rained cats and dogs, so we had to cancel the picnic.",
    Spanish: "Llovió a cántaros, así que tuvimos que cancelar el picnic.",
  },
  {
    exampleType: "Technical instruction with non-translated terms",
    English:
      "Before restarting the server, flush the DNS cache, then call the /reboot API endpoint using a POST request.",
    Spanish:
      "Antes de reiniciar el servidor, vacíe la cache de DNS y luego llame al endpoint /reboot de la API mediante una petición POST.",
  },
  {
    exampleType: "Pronominal Verb and Future Tense Context",
    English:
      "We will see each other at the conference next month, if all goes well.",
    Spanish: "Nos veremos en la conferencia el próximo mes, si todo sale bien.",
  },
  {
    exampleType: "Scheduling with passive voice",
    English:
      "The meeting has been postponed until April 10th, 2024 at 11:00 AM.",
    Spanish:
      "La reunión ha sido aplazada hasta el 10 de abril de 2024 a las 11:00.",
  },
] as const;
