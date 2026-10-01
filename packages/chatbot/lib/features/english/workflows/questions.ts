/**
 * The English Helper's classification questions for Jev (the Decision API),
 * offered as closed `choice` sets — same pattern as
 * `lib/features/chat/mode-routing/questions.ts`: each criteria KEY is an
 * option the classifier may answer with, each value describes when it
 * applies, and the version constant tags the wording so two revisions stay
 * comparable.
 *
 * There is no confidence gate: whatever Jev decides is applied as-is
 * (`confidence` is provenance only). Per-question fallbacks for call failure
 * or unknown answers live in `policy.ts`.
 */

/**
 * Version of the questions/criteria below. Bump it whenever they change.
 */
export const ENGLISH_CLASSIFICATION_QUESTIONS_VERSION = 1;

/** Wire-format keys inside the Decisions API's `questions`/`answers` maps. */
export const DIRECTION_QUESTION_KEY = "direction";
export const AUDIENCE_QUESTION_KEY = "audience";
export const DOMAIN_QUESTION_KEY = "domain";

/**
 * Translation Direction: exactly two fixed routes. What the classifier
 * decides is used as-is; a text in a third language is still forced into one
 * of the two (MVP scope).
 */
export const DIRECTION_OPTIONS = ["es-to-en", "en-to-es"] as const;
export type DirectionOption = (typeof DIRECTION_OPTIONS)[number];

/** Audience of the text (register/reader steering; domain is terminology only). */
export const AUDIENCE_OPTIONS = [
  "general",
  "professionals",
  "internal",
  "partners",
  "executives",
] as const;
export type AudienceOption = (typeof AUDIENCE_OPTIONS)[number];

/**
 * Domain: closed set of terminology areas. `none` ("no specialized
 * terminology") doubles as the fallback and removes the domain block from the
 * prompt entirely.
 */
export const DOMAIN_OPTIONS = [
  "software",
  "devops",
  "data-ai",
  "security",
  "legal",
  "medical",
  "finance",
  "marketing",
  "academic",
  "none",
] as const;
export type DomainOption = (typeof DOMAIN_OPTIONS)[number];

export interface ChoiceQuestion<OPTION extends string> {
  instructions: string;
  criteria: Record<OPTION, string>;
}

export const ENGLISH_DIRECTION_QUESTION: ChoiceQuestion<DirectionOption> = {
  instructions:
    "Classify the language the text in `text` is written in and pick the " +
    "translation direction it must be processed with. Answer with exactly " +
    "one of the criteria keys.",
  criteria: {
    "es-to-en":
      "The text is written in Spanish; it must be translated into English (UK).",
    "en-to-es":
      "The text is written in English; it must be translated into Spanish (Spain).",
  },
};

export const ENGLISH_AUDIENCE_QUESTION: ChoiceQuestion<AudienceOption> = {
  instructions:
    "Classify the most likely target audience of the text in `text`. " +
    "Answer with exactly one of the criteria keys.",
  criteria: {
    general:
      "Public-facing text for a broad readership; simple, accessible language.",
    professionals:
      "Cross-departmental colleagues; moderate formality, structured, niche terms explained.",
    internal:
      "Immediate team; informal, chat-like, heavy jargon and acronyms expected.",
    partners:
      "External business partners; collaborative, clear expectations.",
    executives:
      "Executives or investors; formal, polished, business-metric focused.",
  },
};

export const ENGLISH_DOMAIN_QUESTION: ChoiceQuestion<DomainOption> = {
  instructions:
    "Classify the area whose specialized terminology the text in `text` " +
    "uses. Answer `none` when the text uses no specialized terminology. " +
    "Answer with exactly one of the criteria keys.",
  criteria: {
    software:
      "Software design and development: languages, frameworks, APIs, architecture, code review, version control.",
    devops:
      "Infrastructure and operations: CI/CD, cloud, containers, networks, monitoring, SRE, infrastructure as code.",
    "data-ai":
      "Data and artificial intelligence: machine learning, LLMs, data pipelines, analytics, applied statistics.",
    security:
      "Cybersecurity: vulnerabilities, pentesting, identity, hardening, incident response.",
    legal: "Law, contracts, compliance, regulatory language.",
    medical: "Medicine, healthcare, life sciences, clinical terminology.",
    finance: "Banking, accounting, investing, corporate finance.",
    marketing: "Advertising, brand, growth, content copy.",
    academic: "Research and scholarship: papers, citations, academic register.",
    none: "The text uses no specialized terminology.",
  },
};
