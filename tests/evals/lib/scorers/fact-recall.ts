import { createScorer } from "evalite"
import { generateObject } from "ai"
import { z } from "zod"
import type { EvalResult } from "../types"
import { providers } from "@/lib/infrastructure/ai/providers"

const judgeModel = () => providers.opencodeGo("deepseek-v4-flash")

const judgeEvaluationSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Rate from 0 to 1: 1.0 = fully recalls, 0.7 = partial with minor omissions, 0.3 = mentions topic but wrong details, 0.0 = does not recall or hallucinates",
    ),
  reasoning: z
    .string()
    .describe("Brief explanation for the score"),
})

export const factRecall = createScorer<string, EvalResult>({
  name: "Fact Recall",
  description:
    "Uses LLM judge to verify the model recalls injected facts after compaction",
  scorer: async ({ output }) => {
    if (output.answers.length === 0) {
      return {
        score: 0,
        metadata: { reason: "No answers to evaluate" },
      }
    }

    const evaluations = await Promise.all(
      output.answers.map((answer) => evaluateFactAnswer(answer)),
    )

    const totalScore =
      evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length

    return {
      score: totalScore,
      metadata: {
        evaluations,
        averageScore: totalScore,
      },
    }
  },
})

async function evaluateFactAnswer(answer: {
  fact: string
  question: string
  answer: string
}): Promise<{ score: number; fact: string; reasoning: string }> {
  const prompt = `You are evaluating whether an AI assistant correctly recalled a specific fact after conversation compaction.

FACT THAT WAS INJECTED: "${answer.fact}"

QUESTION ASKED: "${answer.question}"

ASSISTANT'S ANSWER: "${answer.answer}"

Return your evaluation as a JSON object.`

  try {
    const result = await generateObject({
      model: judgeModel(),
      prompt,
      temperature: 0,
      schema: judgeEvaluationSchema,
    })

    return {
      score: result.object.score,
      fact: answer.fact,
      reasoning: result.object.reasoning,
    }
  } catch {
    return {
      score: 0,
      fact: answer.fact,
      reasoning: "Failed to parse judge response",
    }
  }
}
