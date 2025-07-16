import { generateObject } from "ai";
import { z } from "zod";
import { languageModelConfigurations } from "@/lib/ai/models";
import { getObject } from "@/lib/ai/utils";

export const sourceLanguages = ["Spanish", "English"] as const;
export const targetLanguages = ["Spanish (Spain)", "English (UK)"] as const;
export const audiences = [
  "general_public",
  "professionals",
  "internal_team",
  "partners",
  "executives_or_investors",
] as const;

export const audienceInstructions = {
  professionals:
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

export const identifyTranslationDirection = (prompt: string) => {
  return generateObject({
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
};

export const identifyAudience = (prompt: string) => {
  return generateObject({
    ...languageModelConfigurations["Llama 3.1 Instant"],
    schema: z.object({
      audience: z.enum(audiences),
    }),
    system: `
    You are an expert communications analyst. Your task is to identify the primary audience that a given text is directed towards.
    Choose from the following options:
    - "general_public" (for public-facing content),
    - "professionals" (for communications to other professionals in the company, such as cross-departmental colleagues. Key criteria: Structured format (e.g., sections, guidelines); moderate formality; explanations of terms if not universal. Example: 'In the following sections, we will provide guidelines... It is important to note that these are a first version.' Avoid: Casual slang or team-specific shortcuts. Goal: Efficient information sharing and alignment.),
    - "internal_team" (for communications within the immediate team. Key criteria: Conversational style; use of internal acronyms/jargon (e.g., 'shoppingbasket', 'bookings-feapi'); brevity and directness. Example: 'No lo controlo, pero diría que se escribe cuando se crea una shoppingbasket... hasta donde yo sé.' Avoid: Formal structures or over-explanations. Goal: Fast operational clarity.),
    - "partners" (for content directed at business partners),
    - "executives_or_investors" (for content directed at executives or investors).
    `,
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
};

export const identifyDomain = (prompt: string) => {
  return generateObject({
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
};
