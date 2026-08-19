import { readFileSync, readdirSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const tracesDir = resolve(__dirname, "../../../../tests/evals/traces")

interface TraceEvent {
  ts: string
  runId: string
  requestId: string
  stepIndex: number
  mode: "generate" | "stream"
  chatId?: string
  userId?: string
  agent?: string
  modelKey?: string
  phase: string
  blockId?: string
  blockKind?: "text" | "reasoning" | "tool-input"
  payload: unknown
}

interface EvalTrace {
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
  traces: Array<{
    timestamp: string
    type: "simulator" | "chatbot" | "judge"
    input?: string
    output?: string
    tokens?: { input: number; output: number }
    duration_ms?: number
    metadata?: Record<string, unknown>
  }>
}

function loadEvalTraces(limit?: number): EvalTrace[] {
  try {
    let files = readdirSync(tracesDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse()

    if (limit && limit > 0) {
      files = files.slice(0, limit);
    }

    return files.map((f) => {
      const content = readFileSync(resolve(tracesDir, f), "utf8")
      return JSON.parse(content) as EvalTrace
    })
  } catch {
    return []
  }
}

interface ResolvedChatbotRun {
  isLegacy: boolean;
  dirPath?: string;
  lifecycle: string;
  stream: string;
  errors: string;
  summary?: string;
}

let chatbotIndex: Map<string, string> | null = null;

function getChatbotIndex(): Map<string, string> {
  if (chatbotIndex) return chatbotIndex;
  chatbotIndex = new Map();
  const chatbotDir = resolve(tracesDir, "chatbot");
  try {
    if (existsSync(chatbotDir)) {
      const entries = readdirSync(chatbotDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const idx = entry.name.indexOf("_");
          const runIdShort = idx !== -1 ? entry.name.slice(idx + 1) : entry.name;
          chatbotIndex.set(runIdShort, resolve(chatbotDir, entry.name));
        }
      }
    }
  } catch {}
  return chatbotIndex;
}

function resolveChatbotRunFiles(runId: string): ResolvedChatbotRun | null {
  const runIdShort = runId.length > 8 ? runId.slice(0, 8) : runId;
  const chatbotDir = resolve(tracesDir, "chatbot");

  // 1. New segmented format via index
  const index = getChatbotIndex();
  const dirPath = index.get(runIdShort) ?? index.get(runId);
  if (dirPath && existsSync(dirPath)) {
    return {
      isLegacy: false,
      dirPath,
      lifecycle: resolve(dirPath, "lifecycle.ndjson"),
      stream: resolve(dirPath, "stream.ndjson"),
      errors: resolve(dirPath, "errors.ndjson"),
      summary: resolve(dirPath, "summary.json"),
    };
  }

  // 2. Legacy format
  const legacyPath = resolve(tracesDir, `${runId}.ndjson`);
  if (existsSync(legacyPath)) {
    return {
      isLegacy: true,
      lifecycle: legacyPath,
      stream: legacyPath,
      errors: legacyPath,
    };
  }

  // 3. Legacy format under chatbot
  const legacyPathCB = resolve(chatbotDir, `${runId}.ndjson`);
  if (existsSync(legacyPathCB)) {
    return {
      isLegacy: true,
      lifecycle: legacyPathCB,
      stream: legacyPathCB,
      errors: legacyPathCB,
    };
  }

  return null;
}

function loadModelTraces(runId: string): TraceEvent[] {
  const resolved = resolveChatbotRunFiles(runId);
  if (!resolved) return [];

  const loadFile = (path: string): TraceEvent[] => {
    if (!existsSync(path)) return [];
    try {
      const content = readFileSync(path, "utf8");
      return content
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as TraceEvent);
    } catch {
      return [];
    }
  };

  if (resolved.isLegacy) {
    return loadFile(resolved.lifecycle);
  }

  const lifecycleEvents = loadFile(resolved.lifecycle);
  const streamEvents = loadFile(resolved.stream);
  const merged = [...lifecycleEvents, ...streamEvents];

  return merged.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}

function findNdjsonForRun(runId: string): string | null {
  const resolved = resolveChatbotRunFiles(runId);
  return resolved ? resolved.lifecycle : null;
}

function listNdjsonFiles(): string[] {
  const list: string[] = [];
  const chatbotDir = resolve(tracesDir, "chatbot");
  
  try {
    if (existsSync(chatbotDir)) {
      const entries = readdirSync(chatbotDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const runIdShort = entry.name.split("_")[1] || entry.name;
          list.push(`${entry.name} (runId: ${runIdShort})`);
        }
      }
    }
  } catch {}

  try {
    const legacyFiles = readdirSync(tracesDir)
      .filter((f) => f.endsWith(".ndjson"));
    list.push(...legacyFiles);
  } catch {}

  return list.sort().reverse();
}

function formatTokens(t: unknown): string {
  if (!t || typeof t !== "object") return "n/a"
  const obj = t as Record<string, unknown>
  const readTotal = (key: string): number | undefined => {
    const v = obj[key]
    if (typeof v === "number") return v
    if (v && typeof v === "object") {
      const total = (v as Record<string, unknown>).total
      if (typeof total === "number") return total
    }
    return undefined
  }
  const inp = readTotal("inputTokens")
  const out = readTotal("outputTokens")
  const parts: string[] = []
  if (inp !== undefined) parts.push(`${inp.toLocaleString()} in`)
  if (out !== undefined) parts.push(`${out.toLocaleString()} out`)
  return parts.length > 0 ? parts.join(" / ") : "n/a"
}

function summarizeModelEvents(events: TraceEvent[]): {
  requests: number
  steps: number
  textBlocks: number
  reasoningBlocks: number
  toolCalls: string[]
  sources: Array<{ url: string; title?: string }>
  tokens: { input: number; output: number }
  durationMs: number
  errors: string[]
} {
  let textBlocks = 0
  let reasoningBlocks = 0
  const toolCalls: string[] = []
  const sources: Array<{ url: string; title?: string }> = []
  let totalInput = 0
  let totalOutput = 0
  let minTs = Infinity
  let maxTs = 0
  const errors: string[] = []
  const requestIds = new Set<string>()
  const stepIndices = new Set<string>()

  for (const e of events) {
    requestIds.add(e.requestId)
    stepIndices.add(`${e.requestId}:${e.stepIndex}`)

    const t = new Date(e.ts).getTime()
    if (t < minTs) minTs = t
    if (t > maxTs) maxTs = t

    switch (e.phase) {
      case "text-delta": {
        const p = e.payload as { text?: string; blockId?: string }
        if (p.text === "" || p.text === undefined) textBlocks++
        break
      }
      case "reasoning-delta": {
        const p = e.payload as { text?: string; blockId?: string }
        if (p.text === "" || p.text === undefined) reasoningBlocks++
        break
      }
      case "tool-call": {
        const p = e.payload as { toolName?: string }
        if (p.toolName) toolCalls.push(p.toolName)
        break
      }
      case "source": {
        const p = e.payload as { url?: string; title?: string }
        if (p.url) sources.push({ url: p.url, title: p.title })
        break
      }
      case "finish": {
        const p = e.payload as {
          usage?: { inputTokens?: number; outputTokens?: number }
        }
        if (p.usage?.inputTokens) totalInput += p.usage.inputTokens
        if (p.usage?.outputTokens) totalOutput += p.usage.outputTokens
        break
      }
      case "error": {
        const p = e.payload as { error?: { message?: string } }
        errors.push(p.error?.message ?? "unknown error")
        break
      }
      case "abort": {
        errors.push("stream aborted")
        break
      }
    }
  }

  return {
    requests: requestIds.size,
    steps: stepIndices.size,
    textBlocks,
    reasoningBlocks,
    toolCalls,
    sources,
    tokens: { input: totalInput, output: totalOutput },
    durationMs: maxTs > minTs ? maxTs - minTs : 0,
    errors,
  }
}

function printModelSummary(events: TraceEvent[]): void {
  const s = summarizeModelEvents(events)
  console.log(`  Requests:     ${s.requests}`)
  console.log(`  Steps:        ${s.steps}`)
  console.log(`  Text blocks:  ${s.textBlocks}`)
  console.log(`  Reasoning:    ${s.reasoningBlocks}`)
  console.log(`  Tool calls:   ${s.toolCalls.length > 0 ? s.toolCalls.join(", ") : "none"}`)
  console.log(`  Sources:      ${s.sources.length > 0 ? s.sources.map((s) => s.title ?? s.url).join(", ") : "none"}`)
  console.log(`  Tokens:       ${formatTokens(s.tokens)}`)
  console.log(`  Duration:     ${(s.durationMs / 1000).toFixed(1)}s`)
  if (s.errors.length > 0) {
    console.log(`  Errors:       ${s.errors.join(", ")}`)
  }
}

function printModelEvents(events: TraceEvent[], limit = 50): void {
  const shown = events.slice(0, limit)
  for (const e of shown) {
    const ts = new Date(e.ts).toISOString().slice(11, 23)
    const step = `s${e.stepIndex}`
    const block = e.blockId ? ` [${e.blockId}]` : ""
    const payload = summarizePayload(e)
    console.log(`  ${ts} ${step}${block} ${e.phase}: ${payload}`)
  }
  if (events.length > limit) {
    console.log(`  ... (${events.length - limit} more events)`)
  }
}

function summarizePayload(e: TraceEvent): string {
  const p = e.payload as Record<string, unknown>
  switch (e.phase) {
    case "start": {
      const model = p.model as { provider?: string; modelId?: string } | undefined
      return model ? `${model.provider}/${model.modelId}` : "unknown model"
    }
    case "text-delta":
      return typeof p.text === "string"
        ? p.text.length > 80
          ? `"${p.text.slice(0, 80)}..."`
          : `"${p.text}"`
        : "(block start)"
    case "reasoning-delta":
      return typeof p.text === "string"
        ? p.text.length > 80
          ? `"${p.text.slice(0, 80)}..."`
          : `"${p.text}"`
        : "(block start)"
    case "tool-call":
      return `${p.toolName}(${typeof p.input === "string" ? p.input.slice(0, 60) : JSON.stringify(p.input).slice(0, 60)})`
    case "tool-result":
      return `${p.toolName} → ${typeof p.output === "string" ? p.output.slice(0, 80) : JSON.stringify(p.output).slice(0, 80)}`
    case "source":
      return `${p.sourceType ?? "url"}: ${p.title ?? p.url}`
    case "finish": {
      const usage = p.usage as Record<string, unknown> | undefined
      const dur = typeof p.duration_ms === "number" ? `${(p.duration_ms / 1000).toFixed(1)}s` : ""
      return `tokens=${formatTokens(usage)} ${dur}`
    }
    case "error":
      return String(p.error ?? "unknown")
    case "abort":
      return String(p.reason ?? "unknown")
    default:
      return JSON.stringify(p).slice(0, 100)
  }
}

const args = process.argv.slice(2)
const command = args[0] || "summary"

switch (command) {
  case "summary": {
    const traces = loadEvalTraces(10)
    if (traces.length === 0) {
      console.log("No hay trazas. Ejecuta primero: pnpm eval -c compaction")
      break
    }

    console.log("\nÚltimas 10 ejecuciones:\n")
    traces.forEach((t, i) => {
      const hasNdjson = t.traceRunId ? findNdjsonForRun(t.traceRunId) !== null : false
      console.log(`${i + 1}. [${t.status.toUpperCase()}] ${t.eval_name}`)
      console.log(`   Started: ${t.started_at}`)
      console.log(`   Traces: ${t.traces.length}`)
      if (t.score !== undefined) console.log(`   Score: ${t.score}`)
      if (t.traceRunId) {
        console.log(`   TraceRunId: ${t.traceRunId} (${hasNdjson ? "NDJSON ✓" : "NDJSON no encontrado"})`)
      }
      console.log("")
    })

    const ndjsonFiles = listNdjsonFiles()
    if (ndjsonFiles.length > 0) {
      console.log(`Archivos NDJSON de modelo: ${ndjsonFiles.length}`)
    }
    break
  }

  case "last": {
    const traces = loadEvalTraces(1)
    if (traces.length === 0) {
      console.log("No hay trazas. Ejecuta primero: pnpm eval -c compaction")
      break
    }

    const last = traces[0]
    console.log("\nÚltima ejecución (JSON):")
    console.log(JSON.stringify(last, null, 2))

    if (last.traceRunId) {
      const events = loadModelTraces(last.traceRunId)
      if (events.length > 0) {
        console.log(`\nTrazas del modelo (NDJSON, ${events.length} eventos):`)
        printModelEvents(events, 100)
      }
    }
    break
  }

  case "compact": {
    const traces = loadEvalTraces(1)
    if (traces.length === 0) {
      console.log("No hay trazas")
      break
    }

    const last = traces[0]
    console.log("\n=== Última ejecución ===")
    console.log(`Eval: ${last.eval_name}`)
    console.log(`Status: ${last.status}`)
    console.log(`Started: ${last.started_at}`)
    console.log(`Ended: ${last.ended_at}`)
    console.log(`Total traces: ${last.traces.length}`)

    const byType = last.traces.reduce(
      (acc, t) => {
        acc[t.type] = (acc[t.type] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )
    console.log(`\nTraces por tipo:`)
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`)
    })

    const totalTokens = last.traces.reduce(
      (acc, t) => {
        if (t.tokens) {
          acc.input += t.tokens.input
          acc.output += t.tokens.output
        }
        return acc
      },
      { input: 0, output: 0 },
    )
    console.log(`\nTokens (eval-level):`)
    console.log(`  Input: ${totalTokens.input.toLocaleString()}`)
    console.log(`  Output: ${totalTokens.output.toLocaleString()}`)

    const compactionTrace = last.traces.find(
      (t) => t.metadata?.compaction === true,
    )
    if (compactionTrace) {
      console.log(`\n=== Compaction ===`)
      console.log(
        `  Tokens before: ${(compactionTrace.metadata?.tokensBefore as number)?.toLocaleString()}`,
      )
      console.log(`  Model: ${compactionTrace.metadata?.modelUsed}`)
      const summary = compactionTrace.metadata?.summary as string
      console.log(
        `  Summary: ${summary?.slice(0, 200)}${summary?.length > 200 ? "..." : ""}`,
      )
    }

    if (last.traceRunId) {
      const events = loadModelTraces(last.traceRunId)
      if (events.length > 0) {
        console.log(`\n=== Trazas del modelo (NDJSON) ===`)
        printModelSummary(events)
      }
    }
    break
  }

  case "conversation": {
    const traces = loadEvalTraces(1)
    if (traces.length === 0) {
      console.log("No hay trazas")
      break
    }

    const last = traces[0]
    console.log("\n=== Conversación ===\n")

    last.traces
      .filter((t) => t.type === "simulator" || t.type === "chatbot")
      .forEach((t, i) => {
        const role = t.type === "simulator" ? "USER" : "ASSISTANT"
        const content = t.output
        console.log(`[${i + 1}] ${role}:`)
        console.log(`  ${content?.slice(0, 300)}${(content?.length ?? 0) > 300 ? "..." : ""}`)
        if (t.tokens) {
          console.log(
            `  (${t.tokens.input} in / ${t.tokens.output} out, ${t.duration_ms}ms)`,
          )
        }
        console.log("")
      })
    break
  }

  case "judge": {
    const traces = loadEvalTraces(1)
    if (traces.length === 0) {
      console.log("No hay trazas")
      break
    }

    const last = traces[0]
    const judgeTraces = last.traces.filter((t) => t.type === "judge")

    if (judgeTraces.length === 0) {
      console.log("No hay evaluaciones del judge")
      break
    }

    console.log("\n=== Evaluaciones del Judge ===\n")
    judgeTraces.forEach((t, i) => {
      console.log(`[${i + 1}] Fact: ${t.metadata?.fact}`)
      console.log(`Input:\n${t.input?.slice(0, 400)}...`)
      console.log(`\nOutput:\n${t.output}`)
      if (t.tokens) {
        console.log(
          `\n(${t.tokens.input} in / ${t.tokens.output} out, ${t.duration_ms}ms)`,
        )
      }
      console.log("\n" + "=".repeat(60) + "\n")
    })
    break
  }

  case "model": {
    const runId = args[1]
    if (!runId) {
      const ndjsonFiles = listNdjsonFiles()
      if (ndjsonFiles.length === 0) {
        console.log("No hay archivos NDJSON. Ejecuta primero: pnpm eval -c compaction")
        break
      }
      console.log("\nRuns de modelo disponibles:\n")
      ndjsonFiles.slice(0, 10).forEach((f, i) => {
        let cleanRunId = f.replace(".ndjson", "");
        if (f.includes("(runId: ")) {
          cleanRunId = f.split("(runId: ")[1].replace(")", "");
        }
        const events = loadModelTraces(cleanRunId)
        const s = summarizeModelEvents(events)
        console.log(`${i + 1}. ${f}`)
        console.log(`   Steps: ${s.steps}, Tools: ${s.toolCalls.length}, Tokens: ${formatTokens(s.tokens)}`)
      })
      console.log(`\nUso: inspect-evals.ts model <runId>`)
      break
    }

    const events = loadModelTraces(runId)
    if (events.length === 0) {
      console.log(`No se encontró NDJSON para runId: ${runId}`)
      break
    }

    console.log(`\n=== Modelo: ${runId} ===`)
    printModelSummary(events)
    console.log(`\nEventos:\n`)
    printModelEvents(events, 100)
    break
  }

  case "model-conversation": {
    const runId = args[1]
    if (!runId) {
      console.log("Uso: inspect-evals.ts model-conversation <runId>")
      break
    }

    const events = loadModelTraces(runId)
    if (events.length === 0) {
      console.log(`No se encontró NDJSON para runId: ${runId}`)
      break
    }

    console.log(`\n=== Conversación del modelo: ${runId} ===\n`)

    let textBuffer = ""
    let reasoningBuffer = ""
    const toolCalls: Array<{ name: string; input: string }> = []

    for (const e of events) {
      switch (e.phase) {
        case "text-delta": {
          const p = e.payload as { text?: string }
          if (p.text === "" || p.text === undefined) {
            if (textBuffer) console.log(`[assistant] ${textBuffer}`)
            textBuffer = ""
          } else {
            textBuffer += p.text
          }
          break
        }
        case "reasoning-delta": {
          const p = e.payload as { text?: string }
          if (p.text === "" || p.text === undefined) {
            if (reasoningBuffer) console.log(`[reasoning] ${reasoningBuffer}`)
            reasoningBuffer = ""
          } else {
            reasoningBuffer += p.text
          }
          break
        }
        case "tool-call": {
          const p = e.payload as { toolName?: string; input?: unknown }
          if (p.toolName) {
            toolCalls.push({ name: p.toolName, input: JSON.stringify(p.input).slice(0, 200) })
            console.log(`[tool] ${p.toolName}(${JSON.stringify(p.input).slice(0, 100)})`)
          }
          break
        }
        case "source": {
          const p = e.payload as { title?: string; url?: string }
          console.log(`[source] ${p.title ?? p.url}`)
          break
        }
        case "finish": {
          if (textBuffer) { console.log(`[assistant] ${textBuffer}`); textBuffer = "" }
          if (reasoningBuffer) { console.log(`[reasoning] ${reasoningBuffer}`); reasoningBuffer = "" }
          const p = e.payload as { usage?: Record<string, unknown>; duration_ms?: number }
          const dur = typeof p.duration_ms === "number" ? ` ${(p.duration_ms / 1000).toFixed(1)}s` : ""
          console.log(`[finish] ${formatTokens(p.usage)}${dur}`)
          break
        }
        case "error":
        case "abort": {
          console.log(`[${e.phase}] ${JSON.stringify(e.payload).slice(0, 200)}`)
          break
        }
      }
    }
    break
  }

  default:
    console.log(`Comando desconocido: ${command}`)
    console.log("Comandos: summary, last, compact, conversation, judge, model, model-conversation")
}
