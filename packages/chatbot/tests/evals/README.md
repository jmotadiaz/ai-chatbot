# Eval Suite

Test suite para evaluar la calidad del chatbot usando [Evalite](https://evalite.dev).

## Uso

El runner levanta el entorno completo: DB de test, migraciones, `next dev` y evalite. Todo en un solo comando.

```bash
# Ejecutar todos los evals
pnpm eval

# Ejecutar un caso específico
pnpm eval -c compaction

# Flags adicionales
pnpm eval -c compaction --port 3001          # cambiar puerto
pnpm eval -c compaction --keep-db            # no parar la DB al terminar
pnpm eval -c compaction --no-db              # asumir DB ya levantada
pnpm eval -c compaction --no-migrate         # saltar migrate
pnpm eval -c compaction --no-server          # asumir next dev ya levantado
```

## ¿Qué hace el runner?

1. Carga `.env.development.local` (API keys reales; `override:false`).
2. Fuerza vars de evals: `POSTGRES_URL` apuntando a la DB de test (`5434/test`), `AUTH_SECRET=test_secret`, `NEXT_PUBLIC_ENV=evals` (≠ `"test"` para no activar mocks), `TRACE_RECORDS=1`, `TRACE_RUN_ID=<uuid>`, `EVAL_BASE_URL=http://localhost:<port>`.
3. Levanta la DB de test (`docker compose -f docker-compose.test.yml up --wait`).
4. Migra la DB. No siembra datos: cada caso de eval crea su propio usuario con `createTestUser()`.
5. Arranca `next dev --turbo -p <port>` (con prefijo `[next]` en logs) — o reutiliza uno ya corriendo en ese puerto.
6. Espera al HTTP `:200/3xx/4xx` (timeout 120s).
7. Arranca `npx evalite run <case>` con prefijo `[evalite]`.
8. Cleanup: mata los children, baja la DB (salvo `--keep-db`), libera el lockfile `tests/evals/.runner.lock`.

## Casos disponibles

### `compaction`

Evalúa la calidad de la compactación de conversaciones:

- **Compaction Occurred** (determinista): Verifica que la compactación se ejecutó y cumple un ratio de compresión mínimo de 10x
- **Fact Recall** (LLM Judge): Inyecta 3 hechos ficticios en la conversación, dispara la compactación, y verifica con Deepseek v4 Flash que el modelo recuerda los hechos tras la compactación

## Estructura

```
evalite.config.ts                # Configuración global (raíz del proyecto)
scripts/eval-runner.ts           # Runner del entorno (DB, next dev, evalite)
lib/infrastructure/env.ts        # Helpers isTestMode/isEvalMode/resolveEnvFile
lib/infrastructure/ai/tracing/   # Middleware de tracing (wrap LanguageModelV3)
tests/evals/
├── lib/
│   ├── auth.ts                  # Gestión de usuarios de test
│   ├── chatbot-client.ts        # Cliente HTTP para el chatbot
│   ├── simulator.ts             # Simulador de conversación
│   ├── compaction-detector.ts   # Detector de eventos de compactación
│   └── scorers/
│       ├── compaction-occurred.ts
│       └── fact-recall.ts
├── cases/
│   └── compaction.eval.ts
└── scenarios/
    └── compaction-recall.txt
```

## Requisitos

- `.env.development.local` con las API keys reales de los modelos que usan los casos (al menos: `OPENCODE_ZEN_API_KEY`, `OPENROUTER_API_KEY`).
- Docker para levantar la DB de test.
- Sin necesidad de tener la app corriendo — el runner la levanta.

## Trazas

El sistema escribe dos artefactos por run:

1. **Trazas del eval** (`tests/evals/traces/<evalName>-<timestamp>.json`): Eventos de alto nivel (`simulator`, `chatbot`, `judge`) escritos manualmente por el caso de eval. Incluye el `traceRunId` para correlacionar con las trazas internas.

2. **Trazas internas del modelo** (`tests/evals/traces/<runId>.ndjson`): Eventos progresivos (`start`, `text-delta`, `reasoning-delta`, `tool-input-*`, `tool-call`, `tool-result`, `source`, `finish`, `error`, `abort`) escritos por el middleware de tracing sobre cada llamada `streamText`/`generateText` en la app. Se activa con `TRACE_RECORDS=1` (forzado por el runner).

El route handler `/api/chat` propaga `X-Trace-Run-Id` y `X-Trace-Request-Id` en la response, y el `chatbot-client.ts` del eval los lee y los guarda en el `metadata` de la traza del chatbot, permitiendo cruzar ambos archivos.

### Formato de eventos (NDJSON)

Cada línea es un `TraceEvent` JSON. Ejemplo:

```json
{"ts":"2026-06-02T10:00:00.000Z","runId":"<uuid>","requestId":"<uuid>","stepIndex":0,"mode":"stream","chatId":"<id>","userId":"<id>","agent":"context7","modelKey":"Deepseek v4 Flash","phase":"start","payload":{"prompt":[{...}],"model":{"provider":"opencode-zen-go","modelId":"deepseek-v4-flash"},"settings":{...}}}
{"ts":"2026-06-02T10:00:00.123Z","runId":"<uuid>","requestId":"<uuid>","stepIndex":0,"mode":"stream","chatId":"<id>","phase":"text-delta","blockId":"text-1","blockKind":"text","payload":{"text":"Hello"}}
{"ts":"2026-06-02T10:00:00.456Z","runId":"<uuid>","requestId":"<uuid>","stepIndex":0,"mode":"stream","chatId":"<id>","phase":"finish","payload":{"finishReason":{"unified":"stop"},"usage":{"inputTokens":100,"outputTokens":50},"duration_ms":456}}
```

## Analizar resultados

### Usando el skill de análisis

Pide al agente:
> "Analiza la última ejecución del eval de compaction"

El agente usará el skill `eval-analyzer` para:
- Inspeccionar scores y metadata
- Revisar traces de AI SDK
- Diagnosticar problemas
- Proporcionar recomendaciones

### Inspección manual

```bash
# Ver resumen compacto de última ejecución
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts compact

# Ver conversación completa
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts conversation

# Ver evaluaciones del judge
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts judge

# Ver última ejecución completa (JSON)
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts last

# Ver resumen de últimas 10 ejecuciones
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts summary

# Ver trazas del modelo (NDJSON)
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts model
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts model <runId>

# Reconstruir conversación desde la perspectiva del modelo
npx tsx .agents/skills/eval-analyzer/references/inspect-evals.ts model-conversation <runId>
```

### UI de Evalite

```bash
npx evalite
```

Abre `http://localhost:3006` para ver resultados en una interfaz web.

## Añadir nuevos casos

1. Crear `tests/evals/cases/[case-name].eval.ts`
2. Usar `evalite()` con `data`, `task`, y `scorers`
3. Ejecutar con `pnpm eval -c [case-name]`

