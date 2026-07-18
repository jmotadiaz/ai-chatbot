import { randomUUID } from "crypto"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { config } from "dotenv"
import { evalite } from "evalite"
import { generateObject } from "ai"
import { z } from "zod"
import { createTestUser, deleteTestUser } from "../lib/auth"
import { createSimulator } from "../lib/simulator"
import { createChatbotClient } from "../lib/chatbot-client"
import { createCompactionDetector } from "../lib/compaction-detector"
import { createTraceWriter } from "../lib/trace-writer"
import type { EvalResult, FactAnswer, TranscriptMessage } from "../lib/types"
import { providers } from "@/lib/infrastructure/ai/providers"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

config({ path: resolve(__dirname, "../../../.env.development.local") })
config({ path: resolve(__dirname, "../../../.env.development") })
config({ path: resolve(__dirname, "../../../.env.local") })
config({ path: resolve(__dirname, "../../../.env") })



const FACTS = [
  {
    fact: "I'm building a real-time inventory tracking platform called StockPulse",
    question: "What application am I building and what's its name?",
  },
  {
    fact: "We're using Go with NATS for messaging between services",
    question: "What messaging system and programming language are we using?",
  },
  {
    fact: "The app is deployed on a Kubernetes cluster on AWS, running 8 microservices so far",
    question: "Where is the app deployed and how many microservices are currently running?",
  },
]

const DETERMINISTIC_FIRST_MESSAGE = `Hey! I could use some architectural advice on a system I'm working on. ${FACTS.map((f) => f.fact).join(". ")}. What would you recommend as a good starting point for the messaging layer?`

const DETERMINISTIC_REINFORCEMENT_MESSAGE = `Just to recap the context I shared earlier so we're aligned: ${FACTS.map((f) => f.fact).join(". ")}. Given all that, what's your take on the best approach for service discovery in this setup?`

function createDeterministicUserMessage(content: string): TranscriptMessage {
  return {
    id: randomUUID(),
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

async function evaluateFactAnswer(
  answer: {
    fact: string
    question: string
    answer: string
  },
  traceWriter: ReturnType<typeof createTraceWriter>,
): Promise<{ score: number; fact: string; reasoning: string }> {
  const prompt = `FACT THAT WAS INJECTED: "${answer.fact}"
QUESTION ASKED: "${answer.question}"
ASSISTANT'S ANSWER: "${answer.answer}"`

  const startTime = performance.now()

  try {
    const result = await generateObject({
      model: judgeModel(),
      system: `Role: Fact Recall Evaluator
Task: Evaluate whether an AI assistant correctly recalled a specific fact after conversation compaction.

Scoring rubric:
- 1.0: Fully and correctly recalls the fact
- 0.7: Partially recalls with minor omissions
- 0.3: Mentions the topic but gets key details wrong
- 0.0: Does not recall at all or hallucinates

Respond with JSON matching this schema:
{
  "score": number,
  "reasoning": "string"
}`,
      prompt,
      temperature: 0,
      schema: judgeEvaluationSchema,
    })

    const durationMs = Math.round(performance.now() - startTime)

    traceWriter.addTrace({
      type: "judge",
      input: prompt,
      output: JSON.stringify(result.object),
      tokens: {
        input: result.usage?.inputTokens ?? 0,
        output: result.usage?.outputTokens ?? 0,
      },
      duration_ms: durationMs,
      metadata: { fact: answer.fact },
    })

    return {
      score: result.object.score,
      fact: answer.fact,
      reasoning: result.object.reasoning,
    }
  } catch (err) {
    const durationMs = Math.round(performance.now() - startTime)

    traceWriter.addTrace({
      type: "judge",
      input: prompt,
      output: `Error: ${String(err)}`,
      duration_ms: durationMs,
      metadata: { fact: answer.fact, error: true },
    })

    return {
      score: 0,
      fact: answer.fact,
      reasoning: "Failed to parse judge response",
    }
  }
}

evalite("Compaction Quality", {
  data: async () => [
    {
      input: "compaction-recall-test",
      expected: { minCompressionRatio: 10 },
    },
  ],

  task: async (_input): Promise<EvalResult> => {
    let userId: string | null = null
    const traceWriter = createTraceWriter("compaction")

    try {
      const scenarioPath = resolve(
        __dirname,
        "../scenarios/compaction-recall.txt",
      )
      const scenarioPrompt = readFileSync(scenarioPath, "utf8").trim()

      const user = await createTestUser()
      userId = user.id

      const simulator = createSimulator({
        modelKey: "Deepseek v4 Flash",
        scenarioPrompt,
        traceWriter,
      })

      const client = createChatbotClient({
        baseUrl: process.env.EVAL_BASE_URL ?? "http://localhost:3000",
        cookie: user.cookie,
        model: "Deepseek v4 Flash",
        traceWriter,
      })

      const messages: TranscriptMessage[] = []
      let chatId: string | undefined
      let compactionSnapshot: ReturnType<
        typeof createCompactionDetector
      > | null = null
      let compactionData: { tokensBefore: number; summary: string } | null =
        null

      const maxMessages = 10

      for (let i = 0; i < maxMessages; i++) {
        let userMsg: TranscriptMessage
        if (i === 0) {
          userMsg = createDeterministicUserMessage(DETERMINISTIC_FIRST_MESSAGE)
        } else if (i === 2) {
          userMsg = createDeterministicUserMessage(
            DETERMINISTIC_REINFORCEMENT_MESSAGE,
          )
        } else {
          userMsg = await simulator.generateNextMessage(messages, i + 1)
        }

        messages.push(userMsg)

        const result = await client.sendMessage(messages, chatId)

        if (result.chatId && !chatId) {
          chatId = result.chatId
          compactionSnapshot = createCompactionDetector(chatId)
        }

        messages.push(result.message)

        if (compactionSnapshot) {
          const snapshot = await compactionSnapshot.poll()
          if (snapshot) {
            compactionData = {
              tokensBefore: snapshot.tokensBefore,
              summary: snapshot.summary,
            }
            traceWriter.addTrace({
              type: "chatbot",
              output: "Compaction triggered",
              metadata: {
                compaction: true,
                tokensBefore: snapshot.tokensBefore,
                summary: snapshot.summary,
                modelUsed: snapshot.modelUsed,
              },
            })
            break
          }
        }

        await sleep(500)
      }

      if (!compactionData) {
        traceWriter.finalize({ status: "failed" })
        return {
          compacted: false,
          compressionRatio: 0,
          tokensBefore: 0,
          tokensAfter: 0,
          answers: [],
        }
      }

      await sleep(2000)

      const questionMsg = await simulator.generateMessageFromPrompt(
        `Ask the assistant these 3 questions naturally in a single message:
1. ${FACTS[0].question}
2. ${FACTS[1].question}
3. ${FACTS[2].question}`,
      )
      messages.push(questionMsg)

      const result = await client.sendMessage(messages, chatId)
      messages.push(result.message)

      const answers: FactAnswer[] = FACTS.map((factData) => ({
        fact: factData.fact,
        question: factData.question,
        answer: result.textContent,
      }))

      const summaryTokens = Math.ceil(compactionData.summary.length / 4)
      const compressionRatio =
        compactionData.tokensBefore / Math.max(summaryTokens, 1)

      const evalResult: EvalResult = {
        compacted: true,
        compressionRatio,
        tokensBefore: compactionData.tokensBefore,
        tokensAfter: summaryTokens,
        answers,
      }

      traceWriter.finalize({ status: "completed" })
      return evalResult
    } catch (err) {
      traceWriter.finalize({ status: "failed" })
      throw err
    } finally {
      if (userId) {
        await sleep(1000)
        await deleteTestUser(userId)
      }
    }
  },

  scorers: [
    {
      name: "Compaction Occurred",
      scorer: ({ output, expected }) => {
        if (!output.compacted) {
          return {
            score: 0,
            metadata: { reason: "Compaction was not triggered" },
          }
        }

        const minRatio = expected?.minCompressionRatio ?? 10
        const ratio = output.compressionRatio

        if (ratio < minRatio) {
          return {
            score: ratio / minRatio,
            metadata: {
              reason: `Compression ratio ${ratio.toFixed(1)}x below threshold ${minRatio}x`,
              actualRatio: ratio,
              threshold: minRatio,
            },
          }
        }

        return {
          score: 1,
          metadata: {
            reason: `Compaction successful with ${ratio.toFixed(1)}x compression`,
            actualRatio: ratio,
            tokensBefore: output.tokensBefore,
            tokensAfter: output.tokensAfter,
          },
        }
      },
    },
    {
      name: "Fact Recall",
      scorer: async ({ output }) => {
        if (output.answers.length === 0) {
          return {
            score: 0,
            metadata: { reason: "No answers to evaluate" },
          }
        }

        const traceWriter = createTraceWriter("compaction-judge")

        const evaluations = await Promise.all(
          output.answers.map((answer) =>
            evaluateFactAnswer(answer, traceWriter),
          ),
        )

        const totalScore =
          evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length

        traceWriter.finalize({
          status: "completed",
          score: totalScore,
          scorers: [{ name: "Fact Recall", score: totalScore }],
        })

        return {
          score: totalScore,
          metadata: {
            evaluations,
            averageScore: totalScore,
          },
        }
      },
    },
  ],
})
