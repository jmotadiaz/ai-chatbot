import { generateObject } from "ai";
import {
  defaultTemperature,
  getModelConfiguration,
  ModelConfiguration,
} from "../providers";
import { z } from "zod";

export interface AutoModelCalculated {
  modelConfig: ModelConfiguration;
  temperature: number;
}

export async function autoModel(query: string): Promise<AutoModelCalculated> {
  const { object: classification } = await generateObject({
    ...getModelConfiguration("Llama 4 Maverick"),
    schema: z.object({
      reasoning: z.string(),
      queryType: z.enum([
        "simple_question",
        "general_knowledge",
        "reasoning",
        "code",
        "creative",
        "conversational",
        "translation",
        "summarization",
      ]),
      complexity: z.enum(["simple", "complex"]),
    }),
    prompt: `\n
      # Query Classification for LLM Routing
      Analyze the following user query and classify it to determine the most appropriate LLM routing:

      **Query:** ${query}

      ## Classification Requirements

      ### 1. Query Type
      Classify into one of these categories:
      - **simple_question** - Direct factual questions with straightforward answers
      - **general_knowledge** - Broad informational queries requiring general understanding
      - **reasoning** - Logic problems, analysis, or multi-step thinking required
      - **code** - Programming, debugging, or technical implementation requests
      - **creative** - Writing, brainstorming, or artistic content generation
      - **conversational** - Casual chat, personal advice, or social interaction
      - **translation** - Language translation or linguistic analysis
      - **summarization** - Content condensation or key point extraction

      ### 2. Complexity Level
      Determine complexity:
      - **simple** - Can be answered quickly with basic knowledge or single-step process
      - **complex** - Requires deep analysis, multi-step reasoning, or specialized expertise
      ### 3. Reasoning
      Brief reasoning for classification\n
    `,
  });

  const { queryType, complexity } = classification;
  switch (queryType) {
    case "simple_question":
      return {
        modelConfig: getModelConfiguration("Llama 4 Maverick"),
        temperature: defaultTemperature,
      };
    case "general_knowledge":
      return {
        modelConfig: getModelConfiguration(
          complexity === "simple" ? "Llama 4 Maverick" : "Gemini 2.5 Flash"
        ),
        temperature: defaultTemperature,
      };
    case "reasoning":
      return {
        modelConfig: getModelConfiguration(
          complexity === "simple" ? "Deepseek R1 Distill" : "o3"
        ),
        temperature: defaultTemperature,
      };
    case "code":
      return {
        modelConfig: getModelConfiguration(
          complexity === "simple" ? "GPT 4.1 Mini" : "Claude Sonnet 4"
        ),
        temperature: defaultTemperature,
      };
    case "creative":
      return {
        modelConfig: getModelConfiguration(
          complexity ? "Llama 4 Maverick" : "Gemini 2.5 Flash"
        ),
        temperature: 1,
      };
    case "conversational":
      return {
        modelConfig: getModelConfiguration(
          complexity ? "Llama 4 Maverick" : "Gemini 2.5 Flash"
        ),
        temperature: 0.8,
      };
    case "translation":
      return {
        modelConfig: getModelConfiguration(
          complexity ? "Llama 4 Maverick" : "Gemini 2.5 Flash"
        ),
        temperature: defaultTemperature,
      };
    case "summarization":
      return {
        modelConfig: getModelConfiguration(
          complexity ? "Llama 4 Maverick" : "Gemini 2.5 Flash"
        ),
        temperature: defaultTemperature,
      };
    default:
      return {
        modelConfig: getModelConfiguration("Llama 4 Maverick"),
        temperature: defaultTemperature,
      };
  }
}
