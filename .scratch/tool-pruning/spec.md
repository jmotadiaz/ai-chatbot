# Spec: Tool Pruning (Watermark-Gated Epoch Masking)

**Status:** draft — listo para revisión

## Problem Statement

Una **Coding Agent Session** larga acumula llamadas a tools y sus resultados: lecturas completas de ficheros, búsquedas con `grep`/`find`, listados y salidas extensas de `bash` (tests, typechecks, logs). Pocos **Turns** después, la mayor parte de ese payload queda obsoleta —el fichero ya se editó o se volvió a leer, la exploración descartó esa ruta o el test que fallaba ya pasó—, pero sigue ocupando la ventana de contexto del modelo y empuja la sesión hacia la **Compaction** de Pi, que sustituye el historial antiguo por un **Compaction Summary** con pérdida irreversible de rutas exactas, diffs, mensajes del usuario, restricciones y líneas de comando.

Los tres diseños previos evaluados en [`comparison.md`](./comparison.md) y [`reference-notes.md`](./reference-notes.md) fallan en al menos uno de tres ejes críticos para `packages/coding-agent`:

1. **Destrucción de la KV-cache del proveedor y latencia innecesaria:** en el catálogo del **Model Gateway**, `cacheRead` es entre **5× y 50× más barato** que `input` (`Deepseek v4.1 Flash`: 50×; `Gemini 4 Argon`: 20×; `Claude Haiku`: 10× con coste explícito de `cacheWrite`). Podar en cada Turn o en cada `tool_result` invalida el sufijo de la KV-cache continuamente y añade ~0,7–1,0 s de latencia serial incluso en sesiones cortas que nunca se acercan al límite de ventana.
2. **El *Ratchet Bug* de evaluar solo el Turn $N-1$ una única vez:** en el flujo natural del agente (*Turn $N-1$ explora ficheros → Turn $N$ edita usando esas lecturas → Turn $N+1$ cambia de subtarea*), las lecturas de $N-1$ siguen siendo necesarias al inicio de $N$ y reciben `keep`. Si cada Turn se juzga una sola vez y `keep` es definitivo, las lecturas más pesadas quedan **inmortalizadas** para el resto de la sesión.
3. **Juez ciego o mal calibrado:** omitir por completo el contenido del `toolResult` en el estado del juez (como hace `fast-jev-compaction`) impide distinguir un log ruidoso de un hallazgo clave o un error; mientras que usar un corte binario `0.5` sobre probabilidades `noul` subconfiadas en la banda `0.25–0.50` (documentada empíricamente en `winnow`) poda contexto todavía necesario.

## Solution

Implementar **Tool Pruning** como una extensión Pi de primera parte en el **Coding Agent Worker** (`packages/coding-agent/extensions/tool-pruning/`) basada en **Watermark-Gated Epoch Masking**:

- **Proyección no destructiva (`pi.on("context")`)**: las llamadas y resultados podados se enmascaran únicamente en la vista `AgentMessage[]` que recibe el proveedor. El archivo `.jsonl` de la sesión, el event log AG-UI, el **File Browser** y el transcript visible en la **Coding Agent UI** permanecen intactos. Todo mensaje que no sea tool (`UserMessage`, prosa y razonamiento de `AssistantMessage`, `CompactionSummaryMessage`) se conserva **verbatim**.
- **Cadencia por Epochs gobernada por Watermarks**: en sesiones cortas o medias la extensión hace **cero llamadas HTTP**, añade **0 ms** de latencia y respeta al **100 % la KV-cache** del proveedor. Un **Epoch** de poda solo se dispara cuando la presión de contexto supera un watermark al inicio de un Turn (`45 %` de `contextWindow` o `30 000` tokens podables acumulados fuera de la ventana protegida) o una válvula de emergencia intra-Turn (`75 %` de `contextWindow`). Entre dos Epochs, la máscara aplicada es estática y el prefijo cacheado vuelve a reutilizarse íntegro.
- **Cooling Window + Living Candidate Pool**: una ventana de enfriamiento protege el Turn activo, el último Turn completado con actividad de tools y la cola reciente de contexto (`16 000` tokens / `6` tool calls). Toda llamada elegible anterior a esa ventana que aún no haya sido podada forma el *Living Pool*: un veredicto `keep` es **efímero** (la llamada vuelve a ser evaluable en futuros Epochs cuando ya haya cumplido su función), mientras que `drop_result` y `drop_call` son terminales en la rama activa para preservar la estabilidad del prefijo.
- **Motor híbrido en dos fases**:
  1. **Fase 0 — Supersesión determinista (`0 ms`, `$0`)**: detecta sin red lecturas de fichero cubiertas por un `read` o `write` posterior exitoso sobre la misma ruta y anota señales estructurales (`editedLater`, `sameCommandRanLater`) para el juez. Si la Fase 0 basta para aliviar la presión, se omite la llamada HTTP.
  2. **Fase 1 — Juez calibrado (`decision-default` vía `POST /v1/systemone`)**: evalúa el *Living Pool* restante sobre un estado compacto con preview `head + tail` de cada resultado, protegiendo errores con un **Error Gate** y aplicando una política asimétrica conservadora (`keepResult < 0.25` en Epochs normales; extensión presupuestada sobre `[0.25, 0.40)` solo en emergencia al `75 %`).
- **Persistencia consciente de ramas (`pi.appendEntry`)**: cada Epoch persiste sus máscaras como entrada `custom` (`"tool-pruning"`) en el árbol de sesión de Pi. Sobrevive a recargas y reinicios del worker y, al reconstruirse leyendo `ctx.sessionManager.getBranch()`, revierte automáticamente cualquier poda que quede en una **Abandoned Branch** tras un **Message Edit**.

## User Stories

1. Como usuario en una **Coding Agent Session** corta o mediana, quiero que el agente responda sin ninguna latencia extra ni sobrecoste por invalidación de KV-cache mientras la ventana de contexto tenga holgura.
2. Como usuario en una **Coding Agent Session** larga de exploración, implementación y verificación, quiero que los payloads obsoletos de `read`, `grep`, `find`, `ls` y `bash` se retiren por bloques antes de agotar la ventana, retrasando al máximo la **Compaction** con resumen y conservando intactos mis mensajes, las ediciones realizadas y las instrucciones previas.
3. Como agente que explora varios ficheros en un Turn, discute el plan con el usuario en el siguiente Turn y aplica los cambios en el tercero, quiero que las lecturas recientes sigan íntegras mientras las uso y solo pasen a ser candidatas a **Tool Pruning** cuando realmente hayan quedado atrás.
4. Como usuario que inspecciona el historial en la **Coding Agent UI** o reconecta a una sesión activa o recargada, quiero seguir viendo todas las llamadas a tools y sus salidas completas sin alteración visual.
5. Como usuario que ejecuta un **Message Edit** para rebobinar la sesión a un **Message** anterior, quiero que las decisiones de poda tomadas en el futuro descartado (**Abandoned Branch**) dejen de aplicarse automáticamente en la nueva rama.
6. Como operador del sistema, quiero que cualquier caída, timeout o respuesta incompleta de `/v1/systemone` degrade en modo *fail-open* sin interrumpir el Turn ni inmortalizar permanentemente los payloads no evaluados.

## Implementation Decisions

### D1. Seam no destructivo e invariantes de proyección (`pi.on("context")`)

- La extensión actúa sobre el clon de `AgentMessage[]` entregado a `pi.on("context")`. Nunca muta entradas del `SessionManager` ni altera los eventos traducidos a AG-UI.
- Existen tres acciones sobre cada par emparejado `(ToolCall, ToolResultMessage)` identificado por `toolCallId`:
  - `keep`: no modifica ni la llamada ni el resultado (tampoco se persiste en el mapa de máscaras; equivale a «sigue vivo»).
  - `drop_result`: conserva intacto el bloque `ToolCall` en el `AssistantMessage` y mantiene el sobre del `ToolResultMessage` (`role: "toolResult"`, `toolCallId`, `toolName`, `isError`, `timestamp`), reemplazando su `content` por un único bloque de texto con stub **Head + Tail**:
    ```text
    <primeros 150 chars del texto original>
    … [Tool Pruning: omitted <N> chars from <toolName>; re-run or re-read if exact output is needed] …
    <últimos 150 chars del texto original>
    ```
    Conservar tanto la cabeza como la cola preserva cabeceras de comando/fichero al inicio y códigos de salida, resúmenes de tests o líneas finales de stack trace al final. Si el `ToolResultMessage` incluía bloques de imagen (`ImageContent`), estos se omiten en la vista proyectada dejando constancia `[<M> image(s) omitted]` en el marcador. Los resultados cuyo texto total sea `<= 380` caracteres y no contengan imágenes nunca reciben `drop_result` (el stub no ahorra tokens reales).
  - `drop_call`: elimina tanto el bloque `ToolCall` (`id === toolCallId`) dentro de `AssistantMessage.content` como su `ToolResultMessage` correspondiente.
- **Invariantes estrictos de serialización para proveedores**:
  1. **Emparejamiento atómico**: jamás se elimina un `ToolCall` dejando su `ToolResultMessage` ni viceversa. Una llamada en vuelo o abortada que no tenga `ToolResultMessage` emparejado en `messages` queda excluida de cualquier operación de poda.
  2. **`AssistantMessage` multi-tool y bloques `ThinkingContent`**: si un `AssistantMessage` contiene varias llamadas (`[Thinking, Text, ToolCall_A, ToolCall_B]`) y solo `ToolCall_A` recibe `drop_call`, se conservan `Thinking`, `Text` y `ToolCall_B` en su orden original. Si **todas** las `ToolCall` de un `AssistantMessage` reciben `drop_call`:
     - Si el mensaje conserva algún `TextContent` no vacío, se mantiene el `AssistantMessage` (incluyendo su `ThinkingContent` y `TextContent`) sin bloques `ToolCall`.
     - Si el mensaje queda sin `TextContent` no vacío y sin `ToolCall` (solo `ThinkingContent` o vacío), se omite el `AssistantMessage` completo para no enviar razonamiento huérfano sin contenido ni acción.
  3. **Mensajes ajenos a tools intocables**: `UserMessage`, `BashExecutionMessage` (comandos ejecutados directamente por el usuario), `CustomMessage` y `CompactionSummaryMessage` pasan siempre sin cambios.

### D2. Política de seguridad por tool y Error Gate

La elegibilidad depende del nombre de la tool siguiendo una lista blanca explícita (*default-deny* para tools desconocidas o futuras):

| Categoría | Tools | Acciones permitidas | Motivo |
| --- | --- | --- | --- |
| Exploratorias (lectura pura) | `read`, `grep`, `find`, `ls` | `keep`, `drop_result`, `drop_call` | Sin efectos laterales; re-ejecutables bajo demanda. |
| Ejecución | `bash` | `keep`, `drop_result` (**nunca `drop_call`**) | Saber qué comando se ejecutó (tests, git, scripts, builds) es trazabilidad causal indispensable. |
| Mutaciones y orquestación | `edit`, `write`, `subagent`, `publish_artifact` y cualquier otra tool no listada | Siempre `keep` | Mutan el **Repository**, delegan **Subagents** o publican **Artifacts**; su registro y resultado son parte del estado de trabajo. |

**Error Gate (`ToolResultMessage.isError === true`)**:
1. Ninguna llamada con `isError === true` puede recibir `drop_call` (ni siquiera `read` o `grep`: recordar que una ruta no existe o falló evita que el agente repita el mismo intento fallido).
2. Los errores cortos (`<= 2 000` caracteres) fuerzan siempre `keep`.
3. Los errores voluminosos (`> 2 000` caracteres, p. ej. una suite de tests con decenas de kilobytes de log) solo pueden recibir `drop_result` (conservando `isError: true` y `head(150) + tail(150)`) cuando han salido de la **Cooling Window** y además:
   - La Fase 0 acredita supersesión posterior exitosa del mismo comando/ruta, o
   - El juez en Fase 1 les asigna `keepResult < dropResultThreshold`.

### D3. Cadencia por Epochs gobernada por Watermarks (preservación de KV-cache)

- En cada invocación a `pi.on("context")`, la extensión aplica primero las máscaras ya registradas en la rama activa (`applyPruningMask`, operación pura en memoria `< 1 ms`) y calcula sobre la vista resultante:
  - `activeTokens`: `calculateContextTokens(lastValidAssistant.usage) + estimateTokens(trailingMessages)` (o `estimateTokens(maskedMessages)` si aún no hay `usage` válido tras iniciar o compactar la sesión).
  - `unmaskedPrunableTokens`: tokens estimados de los pares `(ToolCall, ToolResultMessage)` elegibles según D2 que están **fuera** de la **Cooling Window** y aún no tienen máscara aplicada.
- Existen **dos disparadores de Epoch** (evaluados contra `ctx.model.contextWindow`; si no hubiera modelo resuelto, no se dispara Epoch):
  1. **Watermark de inicio de Turn (primario)**:
     - Se arma en `before_agent_start` y solo se comprueba en la **primera** llamada `context` del Turn (paso 0 del primer **ReAct Cycle**), de modo que los pasos intermedios de un Turn normal jamás invalidan la KV-cache intra-Turn.
     - Dispara un Epoch cuando se cumplen ambas condiciones:
       - `activeTokens >= 0.45 * contextWindow` **o** `unmaskedPrunableTokens >= 30_000` tokens; y
       - `unmaskedPrunableTokens >= 8_000` tokens (`minWorthwhilePruneTokens`: nunca pagar latencia ni invalidar KV-cache por un ahorro potencial marginal).
  2. **Watermark de emergencia intra-Turn (válvula de seguridad)**:
     - Se comprueba en llamadas `context` subsiguientes dentro de un Turn autónomo largo (incluidos **Subagents** exploratorios).
     - Dispara un Epoch cuando `activeTokens >= 0.75 * contextWindow` y `unmaskedPrunableTokens >= 8_000` tokens.
     - Propósito: liberar exploraciones obsoletas de la primera mitad de un Turn maratoniano **antes** de que Pi alcance su techo de auto-compactación (`contextWindow - 16_384`, ~90 %) y fuerce una costosa *Split-Turn Compaction*.
- **Cooldown anti-thrashing (`epochCooldownTokens = 15_000`)**: si un Epoch termina liberando `< 4_000` tokens (porque el contexto viejo sigue siendo legítimamente relevante) o falla en modo *fail-open*, no se volverá a disparar otro Epoch hasta que `unmaskedPrunableTokens` crezca en al menos `15_000` tokens adicionales (salvo que se cruce por primera vez el watermark de emergencia del `75 %`).

### D4. Cooling Window y Living Candidate Pool (resolución del *Ratchet Bug*)

- **Cooling Window unificada (cola protegida — nunca candidata en el Epoch actual)**:
  Recorriendo `messages` desde el final hacia atrás, quedan protegidos todos los mensajes que caigan dentro de la unión de:
  1. El Turn en curso (desde el último `UserMessage` que inició el Turn activo; o la cola activa si es un Epoch intra-Turn).
  2. Los últimos `coolingRecentTokens = 16_000` tokens del contexto enmascarado **y** al menos las últimas `minCoolingToolCalls = 6` tool calls emparejadas.
  3. En Epochs de inicio de Turn, también el **último Turn completado que contenga al menos una tool call**, con un tope de `maxProtectedTurnTokens = 40_000` tokens (si ese único Turn anterior volcó más de `40 000` tokens de salida, se protegen sus `20 000` tokens más recientes y el prefijo excedente pasa a ser evaluable).
  *Por qué esta regla compuesta*: si el Turn 1 lee 8 ficheros para trazar un plan, en el Turn 2 usuario y agente conversan solo en texto (`0` tool calls) para afinar un detalle y en el Turn 3 el usuario pide implementarlo, proteger «el último Turn con actividad de tools» evita que un Turn intermedio de pura conversación desproteja prematuramente los ficheros del plan. Y el tope de `40 000` tokens impide que un único Turn gigante bloquee la válvula de emergencia.
- **Living Candidate Pool**:
  - Son candidatas del Epoch todas las llamadas emparejadas anteriores a la **Cooling Window**, permitidas por D2, que aún no figuren en el mapa de máscaras de la rama activa.
  - Un resultado `keep` **no** congela la llamada: al no grabarse como máscara definitiva, volverá a evaluarse en el siguiente Epoch cuando el objetivo del agente haya avanzado.
  - Un resultado `drop_result` o `drop_call` **sí** es terminal dentro de la rama activa: una llamada con `drop_result` ya ocupa solo ~90 tokens, por lo que re-mutarla a `drop_call` en un Epoch posterior invalidaría una parte más temprana del prefijo cacheado a cambio de un ahorro despreciable.

### D5. Motor de decisión híbrido en dos fases

#### Fase 0: Supersesión determinista y anotación estructural (`0 ms`, `$0`)

Antes de realizar ninguna petición de red, un pase puro analiza la secuencia completa de `messages` (usando también las llamadas dentro de la **Cooling Window** como evidencia de supersesión, pero modificando únicamente candidatas fuera de ella):

1. **Supersesión automática de `read` (sin consultar al juez)**:
   - Ruta normalizada relativa a `ctx.cwd`.
   - Una candidata `read(path)` de fichero completo (sin `offset` ni `limit`, `isError: false`) queda automáticamente podada si existe una llamada posterior exitosa (`isError: false`) sobre la misma `path` que sea otro `read(path)` completo o un `write(path)`:
     - Si entre ambos `read(path)` no hubo `edit(path)` ni `write(path)`, recibe `drop_call` (lectura duplicada pura).
     - Si hubo `edit(path)` o `write(path)` entre medias (o la supersesión proviene de `write(path)`), recibe `drop_result` (conserva la traza temporal «leyó X → modificó X» y libera el cuerpo obsoleto).
   - Una candidata `read(path, offset, limit)` (`isError: false`) recibe `drop_result` si un `read(path)` posterior exitoso cubre íntegramente ese rango (lectura completa o `[offset2, offset2 + limit2] ⊇ [offset1, offset1 + limit1]`) o si existe un `write(path)` posterior exitoso.
   - Una candidata `read(path)` con `isError: true` y `> 2_000` chars recibe `drop_result` si posteriormente existe un `read(path)` o `write(path)` exitoso sobre esa misma ruta.
2. **Señales estructurales para la Fase 1**:
   Cada candidata superviviente se enriquece con metadatos deterministas visibles para el juez:
   - `editedLater: boolean`: la ruta leída fue modificada después por un `edit(path)` exitoso.
   - `sameCommandRanLater: boolean` y `laterCommandSucceeded: boolean`: para `bash`, el mismo comando normalizado (p. ej. `pnpm test`, `pnpm verify:fast`, `tsc`) volvió a ejecutarse más adelante en la sesión.
3. **Cortocircuito sin red**: si tras aplicar las bajas automáticas de la Fase 0 `activeTokens <= 0.30 * contextWindow` o los tokens restantes en el *Living Pool* caen por debajo de `minJudgeWorthwhileTokens = 4_000`, el Epoch finaliza inmediatamente en `< 1 ms` sin invocar `/v1/systemone`.

#### Fase 1: Juez calibrado (`decision-default` sobre `POST /v1/systemone`)

1. **Construcción del `state` (`maxDecisionStateTokens = 20_000` tokens)**:
   En lugar de enviar la transcripción cruda y truncar primero los argumentos de las tools (defecto crítico de `fast-jev-compaction`), se construye un documento estructurado compacto diseñado para el juez:
   - `goal`: el último `UserMessage` (hasta `1 500` chars), hasta los 2 `UserMessage` previos (`500` chars cada uno), el extracto `Goal / Next Steps` de `CompactionSummaryMessage` si existe y el último texto/plan emitido por el asistente (`800` chars).
   - `recentProtectedDigest`: resumen determinista de lo que el agente **ya conserva íntegro** en la **Cooling Window** (ficheros leídos/editados recientemente y últimos comandos ejecutados), para que el juez sepa con certeza qué información está cubierta en la cola reciente.
   - `timeline`: secuencia cronológica por Turn con digest breve de cada Turn (`<= 300` chars de prosa, mutaciones `edit`/`write` ejecutadas) y entradas detalladas para las candidatas (`id` corto `c1..cN` mapeado 1:1 a `toolCallId`, `tool`, `args` hasta `400` chars preservando `path`/`pattern`/`command`, `chars`, `tokensEst`, `isError`, flags de Fase 0 y **`preview`: `head(200 chars) + " … " + tail(200 chars)`** del `ToolResultMessage`).
   - Si el `state` supera `20 000` tokens estimados (`chars / 4`), se comprime primero la prosa de Turns antiguos sin candidatas; los `args` y `preview` de las candidatas son lo último en reducirse.

2. **Preguntas `noul` adaptadas por política y `criteria` explícitos**:
   - Solo se formulan las preguntas que la política D2 permite ejecutar:
     - Exploratorias (`read`, `grep`, `find`, `ls` con `isError: false`): **2 preguntas `noul`** (`call_cK` y `result_cK`).
     - `bash` (y errores `> 2_000` chars elegibles): **1 sola pregunta `noul`** (`result_cK`), ahorrando la mitad del presupuesto de preguntas en sesiones intensivas en comandos.
   - Cada pregunta incluye `criteria: { true, false }` concisos anclados en `goal`, `recentProtectedDigest` y los flags de supersesión (`editedLater`, `sameCommandRanLater`).
   - **Batching acotado**: máximo `80` preguntas por petición y `28 000` tokens totales (`state + questions`) bajo el límite de `30k` del **Model Gateway**. Si hay más candidatas, se dividen en hasta `maxDecisionBatches = 3` peticiones concurrentes priorizando las candidatas de **mayor tamaño y antigüedad** (ley de Pareto: las llamadas más grandes concentran >90 % del volumen); cualquier candidata pequeña sobrante queda en `keep` para futuros Epochs.

3. **Política asimétrica en dos bandas**:
   - **Modo normal (Epoch de inicio de Turn al `45 %`)**:
     - `keepResult >= 0.25` → `keep` (toda la banda incierta `[0.25, 0.50)` se conserva íntegra para evitar el *regret* observado al cortar en `0.50`).
     - `keepResult < 0.25`:
       - Si la tool admite `drop_call` y `keepCall < 0.15` → `drop_call`.
       - En caso contrario → `drop_result`.
     - Una vez asumida la actualización del prefijo en este Epoch, se aplican **todas** las podas de alta confianza (`< 0.25`) del lote para maximizar el recorrido limpio de KV-cache hasta el próximo Epoch.
   - **Modo emergencia (Epoch intra-Turn al `75 %`)**:
     - Aplica primero todas las podas de alta confianza (`< 0.25`).
     - Si `activeTokens` sigue por encima de `0.60 * contextWindow`, extiende únicamente `drop_result` (**nunca `drop_call`**) sobre candidatas en la banda `[0.25, 0.40)` ordenadas de menor a mayor `keepResult / log2(tokensEst)` hasta situar `activeTokens <= 0.55 * contextWindow` o agotar la banda.

### D6. Fail-Open, Timeouts, Cancelación y Re-elegibilidad

- Cada petición a `POST /v1/systemone` se ejecuta con `AbortSignal.any([AbortSignal.timeout(4_000), ...(turnSignal ? [turnSignal] : [])])`, obteniendo `turnSignal` de `ctx.getSignal()`.
- Si el usuario aborta el Turn en curso, la llamada de decisión se cancela al instante y no escribe ninguna entrada en la sesión.
- Si `/v1/systemone` devuelve error HTTP, agota el timeout de `4 000 ms` o entrega JSON inválido:
  - Las bajas deterministas de **Fase 0** sí se aplican y persisten si superan por sí solas `minJudgeWorthwhileTokens` (`4 000` tokens); en caso contrario no se muta el contexto en ese intento.
  - Las candidatas no juzgadas permanecen en el *Living Pool* (no quedan inmortalizadas para toda la sesión como ocurría con el antiguo D7) y volverán a evaluarse tras el margen `epochCooldownTokens` (`15 000` tokens nuevos), evitando tormentas de reintentos en cada Turn si el servicio está degradado.
- Si un batch responde parcialmente o falta alguna clave en `answers`, esa pregunta individual toma por defecto probabilidad `1.0` (`keep`).

### D7. Persistencia en el árbol de sesión, `Message Edit` y `Compaction` de Pi

- Al completarse un Epoch con al menos una decisión efectiva (`drop_result` o `drop_call`), la extensión persiste una entrada en el `.jsonl` de la sesión mediante `pi.appendEntry("tool-pruning", entry)`:
  ```ts
  interface ToolPruningEpochEntry {
    version: 1;
    epochId: number;
    trigger: "turn_watermark" | "intra_turn_emergency";
    timestamp: number;
    tokensBefore: number;
    tokensSavedEst: number;
    decisions: Record<string, "drop_result" | "drop_call">;
    stats: {
      deterministicDrops: number;
      judgeDrops: number;
      candidatesEvaluated: number;
      batches: number;
      latencyMs: number;
      decisionModel?: string;
      cost?: number;
      failedOpen?: boolean;
    };
  }
  ```
- **Reconstrucción consciente de ramas (`Message Edit`)**:
  - Las entradas `type: "custom"` forman parte del árbol `id / parentId` de Pi y **nunca** se convierten en `AgentMessage` para el LLM.
  - En lugar de mantener un acumulador desconectado del árbol, el mapa activo de máscaras se deriva de `ctx.sessionManager.getBranch()` (memoizado en memoria por `(sessionId, ctx.sessionManager.getLeafId())`, coste `< 0,05 ms` cuando cambia la hoja).
  - Consecuencia directa verificada contra `turn-runner.ts` (`navigateTree`, `branch` y `resetLeaf` en **Message Edit**): cuando el usuario edita un **Message** anterior, la hoja activa retrocede y cualquier `ToolPruningEpochEntry` posterior queda automáticamente en la **Abandoned Branch**, restaurando de forma limpia los tool results que aún no estaban podados en ese punto de la historia.
- **Interacción con la auto-compactación de Pi (`Compaction`)**:
  - `shouldCompact` en Pi evalúa `assistantMessage.usage` devuelto por el proveedor sobre el contexto **ya enmascarado**, por lo que **Tool Pruning** pospone de forma directa y exacta la **Compaction** de Pi sin parches sobre el SDK.
  - Cuando en sesiones muy largas el propio contexto enmascarado (prosa acumulada, ediciones y `keep` legítimos) alcanza finalmente `contextWindow - reserveTokens` (`16 384`), la **Compaction** nativa de Pi actúa como techo de último recurso. Su `keepRecentTokens` (`20 000`) está alineado con nuestra **Cooling Window**, y tras `session_compact` las decisiones antiguas cuyos `toolCallId` quedaron resumidos dejan de coincidir con `context.messages` de forma inocua.

### D8. Arquitectura modular, frontera `jiti`, Subagents y Observabilidad

- **Estructura de código en `packages/coding-agent`**:
  - `extensions/tool-pruning/index.ts`: shell mínimo registrado automáticamente por `getFirstPartyExtensionPaths()` en `src/runtime/pi-packages.ts` (siguiendo el patrón de `extensions/artifacts/index.ts`).
  - `src/pruning/`: módulos puros y testeables en aislamiento:
    - `config.ts`: tipos y valores por defecto (`ToolPruningConfig`).
    - `mask.ts`: proyección `applyPruningMask`, stub `head + tail` e invariantes de `AssistantMessage` / `ThinkingContent`.
    - `cooling-window.ts`: partición entre **Cooling Window** y *Living Candidate Pool* + estimación de tokens.
    - `supersession.ts`: Fase 0 determinista y anotación de señales estructurales.
    - `decision-state.ts`: construcción y ajuste presupuestado del `state`, generación de preguntas `noul` y batching.
    - `systemone-client.ts`: cliente HTTP sobre `fetch` contra `${baseUrl}/systemone` con soporte de timeout, `AbortSignal` y validación defensiva de respuesta.
    - `epoch-runner.ts`: orquestador de triggers, cooldown, Fase 0 + Fase 1 y persistencia.
    - `pruning-bridge.ts`: puente ligero vía `Symbol.for` en `globalThis` (mismo patrón documentado en `src/subagent/subagent-bridge.ts`).
- **Resolución de credenciales y aislamiento frente a `jiti`**:
  - Pi carga `extensions/*/index.ts` mediante `jiti` en una instancia de módulos separada. Para evitar duplicar estado de configuración o romper el aislamiento de sandboxes en tests (`createTestWorkerContext()`):
    - `baseUrl` y `contextWindow` se leen directamente de `ctx.model` (`ctx.model.baseUrl` ya apunta a `${gatewayUrl}/v1` del sandbox o **Environment** activo).
    - `apiKey` se obtiene mediante `await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model)` desde el `ModelRuntime` inyectado en la sesión (sin leer `process.env` ni `config` global, cumpliendo ADR 0011 y ADR 0014).
    - `pruning-bridge.ts` (`Symbol.for("codingAgent.toolPruningBridge")`) solo transporta dos cosas entre el runtime del worker y `jiti`: (a) el sink real de `getTraceLogger("worker")` para no perder el `AsyncLocalStorage` de `tracing`, y (b) overrides opcionales de `ToolPruningConfig` inyectados desde `WorkerRuntimeConfig` en tests.
- **Subagents**: la extensión permanece activa tanto en sesiones padre como en **Subagents**. En **Subagents** acotados habituales no se cruza el watermark del `45 %` (`0 ms`, `0` peticiones); en **Subagents** de investigación profunda que superen el `75 %` de ventana, el watermark de emergencia evita que fallen o degraden por compactación partida a mitad de tarea.
- **Observabilidad**:
  - **Sin elementos en UI en v1**: **Tool Pruning** es infraestructura transparente; el usuario conserva el transcript íntegro en la **Coding Agent UI**.
  - **Telemetría en sesión y trazas**: cada Epoch queda auditado en el propio `.jsonl` de la sesión (`ToolPruningEpochEntry`, inspeccionable por `trace-analyzer`) y emite eventos estructurados en `TraceLogger` (`tool_pruning.epoch_completed`, `tool_pruning.epoch_failed_open`).

### Resumen de parámetros por defecto (`ToolPruningConfig`)

| Parámetro | Valor por defecto | Función |
| --- | --- | --- |
| `enabled` | `true` | Activa/desactiva **Tool Pruning** (configurable en `WorkerRuntimeConfig` para tests). |
| `softWatermarkRatio` | `0.45` | Fracción de `contextWindow` que habilita Epoch al inicio de Turn. |
| `minPrunableDeltaTokens` | `30_000` | Dispara Epoch al inicio de Turn aunque la ventana sea enorme si ya hay `30k` tokens viejos podables. |
| `hardWatermarkRatio` | `0.75` | Fracción de `contextWindow` que dispara Epoch de emergencia intra-Turn. |
| `minWorthwhilePruneTokens` | `8_000` | Mínimo de tokens podables fuera de la **Cooling Window** para iniciar un Epoch. |
| `minJudgeWorthwhileTokens` | `4_000` | Mínimo restante tras Fase 0 para justificar la llamada HTTP a `/v1/systemone`. |
| `epochCooldownTokens` | `15_000` | Crecimiento adicional requerido tras un Epoch de bajo ahorro o *fail-open*. |
| `coolingRecentTokens` | `16_000` | Cola mínima reciente protegida siempre en la **Cooling Window**. |
| `minCoolingToolCalls` | `6` | Número mínimo de tool calls recientes protegidas siempre. |
| `maxProtectedTurnTokens` | `40_000` | Tope de protección para el último Turn con tools (`20_000` si lo excede). |
| `stubHeadChars` / `stubTailChars` | `150` / `150` | Caracteres conservados al principio y al final en `drop_result` (mínimo `380` chars para truncar). |
| `errorTruncateMinChars` | `2_000` | Tamaño mínimo para permitir `drop_result` sobre un `ToolResultMessage` con `isError: true`. |
| `maxDecisionStateTokens` | `20_000` | Presupuesto máximo del `state` enviado a `decision-default`. |
| `maxQuestionsPerBatch` / `maxDecisionBatches` | `80` / `3` | Límite de preguntas por petición y concurrencia máxima hacia `/v1/systemone`. |
| `dropResultThreshold` / `dropCallThreshold` | `0.25` / `0.15` | Umbrales `noul` conservadores en modo normal (`keepResult < 0.25`, `keepCall < 0.15`). |
| `emergencyUpperBand` / `emergencyTargetRatio` | `0.40` / `0.55` | Techo de banda incierta (`drop_result` solo) y objetivo post-poda en emergencia (`75 %`). |
| `decisionTimeoutMs` | `4_000` | Timeout máximo por Epoch para `/v1/systemone` antes de *fail-open*. |

## Testing Decisions

- **Extensión del toolkit oficial `@ai-chatbot/model-gateway-testing` (`packages/model-gateway/js`)**:
  - `scenario.ts` ya enruta `POST /v1/systemone` hacia `config.decisions`, pero `decisionsResponse` en `protocol.ts` solo renderiza preguntas `type: "choice"`.
  - Se ampliará `decisionsResponse` para soportar preguntas `type: "noul"` (devolviendo respuesta numérica en `[0, 1]`, con `0.5` por defecto y overrides declarativos `nouls?: Readonly<Record<string, number>>` validados contra las claves de `request.questions`), manteniendo todos los tests en la costura HTTP oficial (MSW en unit tests y **Mock Model Gateway** en `:4001`).
- **Tests unitarios de dominio puro (`packages/coding-agent/tests/unit/pruning/`)**:
  - **Proyección e invariantes (`mask.test.ts`)**: preservación de emparejamiento `toolCallId`, `AssistantMessage` con múltiples tool calls, preservación/omisión correcta de `ThinkingContent`, formato `head + tail`, omisión de imágenes y no-truncado de resultados cortos (`<= 380` chars).
  - **Política por tool y Error Gate (`policy.test.ts`)**: `bash` nunca recibe `drop_call`, `edit`/`write`/`subagent`/`publish_artifact` y tools desconocidas siempre `keep`, errores cortos intactos y errores `> 2_000` chars limitados a `drop_result`.
  - **Cooling Window (`cooling-window.test.ts`)**: caso *Explorar (Turn 1) → Conversar en prosa sin tools (Turn 2) → Editar (Turn 3)*, Turn único gigante (`> 40k` tokens) y modo intra-Turn.
  - **Fase 0 determinista (`supersession.test.ts`)**: `read` completo superado por `read` o `write` posterior, `read` con `offset/limit` cubierto vs parcial, distinción `drop_call` vs `drop_result` cuando media un `edit`, y cortocircuito sin llamada HTTP.
  - **Estado, batching y umbrales (`decision-state.test.ts`, `epoch-runner.test.ts`)**: ajuste a `20k` tokens comprimiendo prosa antes que `args`/`preview`, 1 pregunta para `bash` vs 2 para exploratorias, política en dos bandas (`0.25` / `0.15`) y ranking presupuestado en modo emergencia (`75 %`).
- **Tests de integración en proceso del worker (`packages/coding-agent/tests/unit/pruning/session-integration.test.ts`)**:
  - Usando `createTestWorkerContext()` + `setupWorkerGatewayHarness()` (MSW, sin tocar `.pi-prod`/`.pi-dev` ni `process.env`):
    1. Sesión por debajo del watermark: `0` llamadas a `/v1/systemone` y contexto idéntico byte a byte.
    2. Cruce del watermark en Turn $T$: ejecución del Epoch, verificación del payload `messages` recibido por `/v1/chat/completions` en el proveedor y conservación íntegra del transcript devuelto a la **Coding Agent UI**.
    3. Recarga en frío de la sesión desde disco (`SessionManager` / `SessionRegistry`): las máscaras de `ToolPruningEpochEntry` se reaplican sin volver a llamar a `/v1/systemone`.
    4. **Message Edit**: tras podar en un Turn posterior y rebobinar a un **Message** previo, la máscara en la **Abandoned Branch** deja de aplicarse y el resultado original reaparece para el modelo.
    5. **Fail-open**: error `500` o timeout en `/v1/systemone` no rompe el Turn y las candidatas siguen siendo elegibles tras superar `epochCooldownTokens`.

## Out of Scope

- Sustituir o modificar la **Compaction** por resumen del Chatbot (`packages/chatbot/lib/features/compaction/`).
- Ocultar o desactivar definiciones de tools activas (`pi.setActiveTools`).
- Resumir, parafrasear o reescribir mensajes de usuario o de asistente (eso pertenece exclusivamente a la **Compaction** cuando actúa como techo final).
- Indicadores visuales o controles manuales de **Tool Pruning** en la **Coding Agent UI** en v1.
- Poda síncrona de un único `tool_result` antes de que el modelo lo lea por primera vez (los límites deterministas por llamada individual —`2 000` líneas / `50 KB` en las tools `read` y `bash` de Pi— ya cubren ese caso sin latencia de red).

## Puntos de calibración para revisar antes de pasar a issues

Todos los mecanismos del diseño son consistentes entre sí; estos son los valores concretos fijados con criterio propio por si quieres ajustar alguno antes de desglosar los issues:

1. **Watermarks (`45 %` normal / `75 %` emergencia / `30k` delta podable)**: en un modelo de `160k` tokens, el primer Epoch salta alrededor de `72k` tokens totales (o antes si ya se acumularon `30k` tokens de tool outputs viejos fuera de la **Cooling Window**), dejando ~65–85k tokens de margen antes de la **Compaction** de Pi (`~144k`).
2. **Umbrales `noul` (`dropResult = 0.25`, `dropCall = 0.15`)**: priorizan cero *regret* sobre agresividad máxima en Epochs normales, delegando el recorte más agresivo (`hasta 0.40`, solo `drop_result`) únicamente a la válvula de emergencia del `75 %`.
3. **Cooling Window (`último Turn con tools` hasta `40k` + mínimo `16k` tokens / `6` calls)**: protege un ciclo completo de *explorar → discutir → editar* sin inmortalizar lecturas más allá de su ventana de uso real.
