import { writeFileSync, mkdirSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface TraceEntry {
  timestamp: string
  type: "simulator" | "chatbot" | "judge"
  input?: string
  output?: string
  tokens?: {
    input: number
    output: number
  }
  duration_ms?: number
  metadata?: Record<string, unknown>
}

export interface EvalTrace {
  eval_name: string
  started_at: string
  ended_at?: string
  status: "running" | "completed" | "failed"
  score?: number
  traceRunId?: string
  scorers?: Array<{
    name: string
    score: number
    metadata?: unknown
  }>
  traces: TraceEntry[]
}

export function createTraceWriter(evalName: string) {
  const traces: TraceEntry[] = []
  const startedAt = new Date().toISOString()
  const traceId = `${evalName}-${Date.now()}`
  let traceRunId: string | undefined

  return {
    addTrace(entry: Omit<TraceEntry, "timestamp">) {
      const md = entry.metadata as
        | { traceRunId?: string; traceRequestId?: string }
        | undefined
      if (md?.traceRunId && !traceRunId) traceRunId = md.traceRunId
      traces.push({
        ...entry,
        timestamp: new Date().toISOString(),
      })
    },

    setTraceRunId(runId: string) {
      traceRunId = runId
    },

    finalize(result: {
      status: "completed" | "failed"
      score?: number
      scorers?: Array<{ name: string; score: number; metadata?: unknown }>
    }) {
      const trace: EvalTrace = {
        eval_name: evalName,
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        status: result.status,
        score: result.score,
        traceRunId,
        scorers: result.scorers,
        traces,
      }

      const tracePath = resolve(
        __dirname,
        `../traces/${traceId}.json`,
      )
      mkdirSync(dirname(tracePath), { recursive: true })
      writeFileSync(tracePath, JSON.stringify(trace, null, 2))
      console.log(`\nTrace saved: ${tracePath}`)
      if (traceRunId) {
        console.log(`Model traces (Segmented): tests/evals/traces/chatbot/*_${traceRunId.slice(0, 8)}/`)
      }
      return tracePath
    },

    getTraces() {
      return traces
    },
  }
}
