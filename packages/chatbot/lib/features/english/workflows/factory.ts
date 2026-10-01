import { streamObject, streamText } from "ai";
import type { CorrectGrammarAiPort, TranslateAiPort } from "./ports";
import { grammarSchema } from "./schemas";
import { stripDelimiters } from "./strip-delimiters";
import {
  buildGrammarSystemPrompt,
  buildGrammarUserPrompt,
  buildTranslateSystemPrompt,
  buildTranslateUserPrompt,
  pickDelimiter,
} from "./utils";

// ─── Factories ───────────────────────────────────────────────────────────────
//
// Both workflows share the same structure: classify the raw text (one
// Decisions call, already fallback-safe through the port), then run the
// generation with a STATIC system prompt (objective + main rules + guardrail,
// cacheable across calls) and a variable user prompt carrying the classified
// context, the delimiter instruction and the delimited raw text. The
// provenance of the classification call is logged as metadata for later
// evaluation — it never gates anything.
//
// The translation workflow also strips the delimiter pair from the output
// stream: the delimiter is picked once, feeds both the user prompt and the
// `experimental_transform`, so a model that echoes the wrapper still yields
// clean text.

export const makeCorrectGrammar =
  (ai: CorrectGrammarAiPort) => async (prompt: string) => {
    const classifications = await ai.classify(prompt);
    console.log("english classification", {
      workflow: "grammar",
      ...classifications,
    });

    return streamObject({
      ...ai.getGrammarModelConfiguration(),
      schema: grammarSchema,
      system: buildGrammarSystemPrompt(),
      prompt: buildGrammarUserPrompt(prompt, classifications),
    });
  };

export const makeTranslate =
  (ai: TranslateAiPort) => async (prompt: string) => {
    const classifications = await ai.classify(prompt);
    console.log("english classification", {
      workflow: "translate",
      ...classifications,
    });

    const delimiter = pickDelimiter(prompt);

    return streamText({
      ...ai.getTranslateModelConfiguration(),
      system: buildTranslateSystemPrompt(),
      prompt: buildTranslateUserPrompt(prompt, classifications, delimiter),
      experimental_transform: stripDelimiters(delimiter),
    });
  };
