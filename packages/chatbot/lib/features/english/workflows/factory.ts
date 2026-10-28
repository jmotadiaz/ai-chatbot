import "server-only";

import { streamObject, streamText } from "ai";
import { classifyForGrammar, classifyForTranslation } from "./classifier";
import { grammarSchema } from "./schemas";
import { stripDelimiters } from "./strip-delimiters";
import {
  buildGrammarSystemPrompt,
  buildGrammarUserPrompt,
  buildTranslateSystemPrompt,
  buildTranslateUserPrompt,
  pickDelimiter,
} from "./utils";
import { warmModelCatalog } from "@/lib/infrastructure/ai/catalog";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

/** The Default Model Contract both English workflows generate with (spec §2.4). */
export const ENGLISH_WORKFLOW_CONTRACT = "flash-default";

/**
 * Generation is a streaming call resolved through the shared inference
 * infrastructure (ADR 0013): the workflow owns the contract, the prompts and
 * the parameters; the kit owns the transport, configuration and tracing.
 * Tests substitute the Gateway at its HTTP seam, not this call.
 */
const generationModelConfiguration = () =>
  inferenceKit.languageModel(ENGLISH_WORKFLOW_CONTRACT);

// ─── Workflows ───────────────────────────────────────────────────────────────
//
// Both workflows share the same structure: classify the raw text (one
// Decisions call, fallback-safe through `policy.ts`), then run the generation
// with a STATIC system prompt (objective + main rules + guardrail, cacheable
// across calls) and a variable user prompt carrying the classified context,
// the delimiter instruction and the delimited raw text. The provenance of the
// classification call is logged as metadata for later evaluation — it never
// gates anything.
//
// The translation workflow also strips the delimiter pair from the output
// stream: the delimiter is picked once, feeds both the user prompt and the
// `experimental_transform`, so a model that echoes the wrapper still yields
// clean text.
//
// `languageModel` is synchronous against the catalog snapshot, so each entry
// point warms it up before generating (classification needs no catalog).

export const correctGrammar = async (prompt: string) => {
  await warmModelCatalog();

  const classifications = await classifyForGrammar(prompt);
  console.log("english classification", {
    workflow: "grammar",
    ...classifications,
  });

  return streamObject({
    ...generationModelConfiguration(),
    schema: grammarSchema,
    system: buildGrammarSystemPrompt(),
    prompt: buildGrammarUserPrompt(prompt, classifications),
  });
};

export const translate = async (prompt: string) => {
  await warmModelCatalog();

  const classifications = await classifyForTranslation(prompt);
  console.log("english classification", {
    workflow: "translate",
    ...classifications,
  });

  const delimiter = pickDelimiter(prompt);

  return streamText({
    ...generationModelConfiguration(),
    system: buildTranslateSystemPrompt(),
    prompt: buildTranslateUserPrompt(prompt, classifications, delimiter),
    experimental_transform: stripDelimiters(delimiter),
  });
};
