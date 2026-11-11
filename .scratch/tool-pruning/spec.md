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
- **Cadencia por Epochs gobernada por escalones con rearme por margen (`watermarks = [0.45, 0.60, 0.75]`, `watermarkGapRatio = 0.15`)**: en sesiones cortas o medias la extensión hace **cero llamadas HTTP**, añade **0 ms** de latencia y respeta al **100 % la KV-cache** del proveedor. Existen tres escalones ordenados de presión de contexto: **`watermarks = [0.45, 0.60, 0.75]`** de `contextWindow`. Un **Epoch** de poda solo se dispara cuando `activeTokens / contextWindow` alcanza un escalón armado y hay al menos `minWorthwhilePruneTokens = 8_000` tokens podables fuera de la ventana protegida. Al ejecutarse un Epoch en un escalón (p. ej. `60 %`), quedan retirados ese escalón y los inferiores, salvo que la poda haya reducido `landingRatio = (tokensBefore - tokensSavedEst) / contextWindow` lo suficiente para que algún escalón quede al menos un **`15 %` (`watermarkGapRatio`)** por encima de ese nivel de aterrizaje (p. ej., si en `75 %` baja a `42 %`, se rearman `60 %` y `75 %`, mientras `45 %` sigue retirado). De este modo, una poda de bajo ahorro o *fail-open* jamás provoca *thrashing* ni reintentos, mientras que una poda muy efectiva permite seguir reciclando ventana en sesiones largas antes de llegar a la **Compaction** nativa de Pi (que rearma todos los escalones).
- **Cooling Window + Living Candidate Pool**: una ventana de enfriamiento unificada protege la cola reciente de contexto (`16 000` tokens **y** al menos `6` tool calls emparejadas) junto con el Turn activo y el último Turn completado con actividad de tools, acotados cada uno a `min(maxProtectedTurnTokens = 40_000, maxProtectedTurnRatio * contextWindow = 0.20 * contextWindow)` (para que ni un único Turn / **Subagent** maratoniano ni dos Turns pesados en ventanas de `100k` bloqueen toda la ventana). Toda llamada elegible anterior a esa ventana que aún no haya sido podada forma el *Living Pool*: un veredicto `keep` es **efímero** (la llamada vuelve a ser evaluable en el siguiente escalón cuando ya haya cumplido su función), mientras que `drop_result` y `drop_call` son terminales en la rama activa para preservar la estabilidad del prefijo.
- **Motor híbrido en dos fases**:
  1. **Fase 0 — Supersesión determinista (`0 ms`, `$0`)**: detecta sin red lecturas de fichero cubiertas por un `read` o `write` posterior exitoso sobre la misma ruta y anota señales estructurales (`editedLater`, `sameCommandRanLater`) para el juez. Si la Fase 0 basta para bajar el contexto a `<= (watermark - watermarkGapRatio) * contextWindow` (o quedan `< 4_000` tokens en el pool), se omite la llamada HTTP.
  2. **Fase 1 — Juez calibrado (`decision-default` vía `POST /v1/systemone`)**: evalúa el *Living Pool* restante sobre un estado compacto con preview `head + tail` de cada resultado, protegiendo errores con un **Error Gate** y aplicando una política asimétrica única y conservadora (`keepResult < 0.25` → `drop_result`, y `keepCall < 0.15` → `drop_call` si la tool lo permite; toda la banda incierta `>= 0.25` se conserva íntegra).
- **Persistencia consciente de ramas y compactación (`pi.appendEntry`)**: cada Epoch persiste su escalón consumido (`watermark`), `contextWindow`, auditoría `noul` y sus máscaras como entrada `custom` (`"tool-pruning"`) en el árbol de sesión de Pi. Al reconstruirse desde `ctx.sessionManager.getBranch()`, conserva las máscaras de toda la rama activa (evitando que payloads ya podados dentro de la cola reciente conservada por una **Compaction** de Pi resuciten), resetea el suelo de escalones tras cada entrada `compaction` y revierte automáticamente cualquier poda o escalón consumido que quede en una **Abandoned Branch** tras un **Message Edit**.

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

### D3. Cadencia por Epochs gobernada por escalones con rearme por margen (preservación de KV-cache)

- En cada invocación a `pi.on("context")`, la extensión reconstruye el estado de la rama activa (máscaras de toda la rama activa y suelo de escalón posterior a la última entrada `compaction`) y aplica primero las máscaras ya registradas (`applyPruningMask`, operación pura en memoria `< 1 ms`). Sobre la vista resultante calcula:
  - `activeTokens`: `calculateContextTokens(lastValidAssistant.usage) - newlyMaskedTokensBeforeLastAssistant + estimateTokens(trailingMessages)` (o `estimateTokens(maskedMessages)` si aún no hay `usage` válido tras iniciar o compactar la sesión).
  - `unmaskedPrunableTokens`: tokens estimados de los pares `(ToolCall, ToolResultMessage)` elegibles según D2 que están **fuera** de la **Cooling Window** y aún no tienen máscara aplicada.
- **Escalera de Watermarks con rearme por margen (`watermarks = [0.45, 0.60, 0.75]`, `watermarkGapRatio = 0.15`)**:
  - Se define una lista ordenada ascendente de fracciones de `ctx.model.contextWindow`: por defecto **`[0.45, 0.60, 0.75]`** (si no hubiera modelo resuelto o `contextWindow <= 0`, no se dispara Epoch).
  - Tras cada Epoch registrado después de la última entrada `compaction`, el suelo retirado efectivo es:
    `effectiveWatermarkFloor = min(watermark, max(0, landingRatio + watermarkGapRatio))` donde `landingRatio = max(0, tokensBefore - tokensSavedEst) / contextWindow` (o `0` si aún no se ha ejecutado ningún Epoch en el ciclo actual).
  - El **siguiente escalón armado (`nextWatermark`)** es el primer valor $w \in \text{watermarks}$ tal que $w > \text{highestConsumedWatermark}$. Si todos los escalones quedan retirados, no se dispara ningún Epoch adicional hasta que la **Compaction** nativa de Pi resuma el historial y rearme la escalera.
  - Cuando en `pi.on("context")` se cumplen ambas condiciones:
    1. `activeTokens >= nextWatermark * contextWindow`, y
    2. `unmaskedPrunableTokens >= minWorthwhilePruneTokens` (`8_000` tokens: nunca pagar latencia ni invalidar KV-cache por un ahorro potencial marginal),
    se dispara un Epoch asignándole como escalón alcanzado el **mayor** $w \in \text{watermarks}$ que cumpla `activeTokens >= w * contextWindow`.
  - **Desactivación sin *thrashing* + rearme solo tras ahorros profundos**:
    - Si un Epoch ahorra poco o termina en *fail-open* (p. ej. empieza en `60 %` y aterriza en `50 %`), `landingRatio + 0.15 = 0.65 > 0.60`, por lo que `0.45` y `0.60` quedan retirados: en los Turns siguientes (`52 %`, `55 %`, `58 %`...) **no** vuelve a dispararse ningún Epoch hasta cruzar el `75 %`.
    - Si en cambio un Epoch logra una limpieza profunda (p. ej. dispara en `75 %` y aterriza en `42 %`), `landingRatio + 0.15 = 0.57`, por lo que `0.45` sigue retirado pero **`0.60` y `0.75` se rearman**, exigiendo al menos `+18 %` de crecimiento nuevo antes de volver a podar.

### D4. Cooling Window y Living Candidate Pool (resolución del *Ratchet Bug*)

- **Cooling Window unificada (cola protegida — nunca candidata en el Epoch actual)**:
  Recorriendo `messages` desde el final hacia atrás, quedan protegidos todos los mensajes que caigan dentro de la unión de tres tramos independientes:
  1. Los últimos `coolingRecentTokens = 16_000` tokens del contexto enmascarado **y** al menos las últimas `minCoolingToolCalls = 6` tool calls emparejadas.
  2. El Turn activo y el **último Turn completado que contenga al menos una tool call** (saltando Turns intermedios de pura conversación sin tools), acotando cada uno al tope proporcional `turnCap = min(maxProtectedTurnTokens = 40_000, maxProtectedTurnRatio * contextWindow = 0.20 * contextWindow)` (si un único Turn supera `turnCap`, se protegen únicamente sus `turnCap / 2` tokens más recientes —p. ej. `20 000` en ventanas `>= 200k` o `10 000` en ventanas de `100k`— y el prefijo excedente pasa a ser evaluable).
  *Por qué esta regla compuesta*: si el Turn 1 lee 8 ficheros para trazar un plan, en el Turn 2 usuario y agente conversan solo en texto (`0` tool calls) para afinar un detalle y en el Turn 3 el usuario pide implementarlo, proteger «el último Turn con actividad de tools» evita que un Turn intermedio de pura conversación desproteja prematuramente los ficheros del plan. Escalar el tope a `0.20 * contextWindow` evita que dos Turns pesados (`40k + 40k`) bloqueen el `80 %` de modelos de `100k` (`Claude Haiku`), mientras que aplicar el tope también al Turn en curso permite podar la primera mitad de un **Subagent** o Turn gigante.
- **Living Candidate Pool**:
  - Son candidatas del Epoch todas las llamadas emparejadas anteriores a la **Cooling Window**, permitidas por D2, que aún no figuren en el mapa de máscaras de la rama activa.
  - Un resultado `keep` **no** congela la llamada: al no grabarse como máscara definitiva, volverá a evaluarse en el siguiente escalón (`60 %` o `75 %`) cuando el objetivo del agente haya avanzado.
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
3. **Cortocircuito sin red (relativo al escalón activo)**: si tras aplicar las bajas automáticas de la Fase 0 `activeTokens <= (watermark - watermarkGapRatio) * contextWindow` (`<= 30 %` en `0.45`, `<= 45 %` en `0.60`, `<= 60 %` en `0.75`) o los tokens restantes en el *Living Pool* caen por debajo de `minJudgeWorthwhileTokens = 4_000`, el Epoch finaliza inmediatamente en `< 1 ms` sin invocar `/v1/systemone` (persistiendo el escalón consumido y las decisiones de Fase 0).

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

3. **Política asimétrica conservadora (única en todos los escalones)**:
   - `keepResult >= 0.25` (`dropResultThreshold`) → `keep` (toda la banda incierta `[0.25, 0.50)` se conserva íntegra para evitar el *regret* observado al cortar en `0.50`).
   - `keepResult < 0.25`:
     - Si la tool admite `drop_call` y `keepCall < 0.15` (`dropCallThreshold`) → `drop_call`.
     - En caso contrario (si admite `drop_result`) → `drop_result`.
   - Una vez asumida la actualización del prefijo en este escalón, se aplican **todas** las podas de alta confianza (`< 0.25`) del lote para maximizar el recorrido limpio de KV-cache hasta el siguiente escalón.

### D6. Fail-Open, Timeouts, Cancelación y Re-elegibilidad

- Cada petición a `POST /v1/systemone` se ejecuta con `AbortSignal.any([AbortSignal.timeout(4_000), ...(turnSignal ? [turnSignal] : [])])`, obteniendo `turnSignal` de `ctx.getSignal()`.
- Si el usuario aborta el Turn en curso (`turnSignal.aborted`), la llamada de decisión se cancela al instante y no escribe ninguna entrada en la sesión (el escalón no se consume porque el Turn fue cancelado por el usuario).
- Si `/v1/systemone` devuelve error HTTP, agota el timeout de `4 000 ms` o entrega JSON inválido:
  - Se aplican las bajas deterministas de **Fase 0** (si las hubo) y se registra el `ToolPruningEpochEntry` con `failedOpen: true` y el `watermark` alcanzado (aunque `decisions` sea `{}`).
  - Al quedar consumido ese escalón (y los inferiores), **no puede producirse una tormenta de reintentos** en los pasos o Turns siguientes si el servicio está degradado: las candidatas no juzgadas permanecen en el *Living Pool* y solo volverán a evaluarse cuando la sesión alcance el siguiente escalón de `watermarks` (p. ej. de `45 %` a `60 %`, o de `60 %` a `75 %`).
- Si un batch responde parcialmente o falta alguna clave en `answers`, esa pregunta individual toma por defecto probabilidad `1.0` (`keep`).

### D7. Persistencia en el árbol de sesión, `Message Edit` y `Compaction` de Pi

- Al completarse un Epoch (ya sea con decisiones efectivas o en *fail-open* tras consumir un escalón), la extensión persiste una entrada en el `.jsonl` de la sesión mediante `pi.appendEntry("tool-pruning", entry)`:
  ```ts
  interface ToolPruningEpochEntry {
    version: 1;
    epochId: number;
    /** Escalón de `watermarks` alcanzado y consumido por este Epoch (p. ej. 0.45, 0.60, 0.75). */
    watermark: number;
    timestamp: number;
    tokensBefore: number;
    tokensSavedEst: number;
    contextWindow?: number;
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
    audit?: readonly ToolPruningCandidateAudit[];
  }
  ```
- **Reconstrucción consciente de ramas (`Message Edit`) y rearme tras `Compaction`**:
  - Las entradas `type: "custom"` forman parte del árbol `id / parentId` de Pi y **nunca** se convierten en `AgentMessage` para el LLM.
  - En lugar de mantener contadores mutables desconectados del árbol, desde `ctx.sessionManager.getBranch()` (memoizado en memoria por `(sessionId, ctx.sessionManager.getLeafId())`, coste `< 0,05 ms` cuando cambia la hoja) se derivan dos estados con alcance distinto:
    1. **Mapa activo de máscaras (`ToolPruningMaskMap`) y sus timestamps de aplicación**: se acumulan a lo largo de **toda** la rama activa, incluidas las entradas anteriores a una `compaction`, porque la **Compaction** de Pi conserva sin resumir los últimos `~20k` tokens (`firstKeptEntryId`) y olvidar esas máscaras resucitaría payloads ya podados dentro de esa cola reciente (mantener emparejados sus timestamps impide restar ese ahorro dos veces).
    2. **Suelo de escalón consumido (`highestConsumedWatermark`)**: se resetea a `0` al cruzar cualquier entrada `type: "compaction"` y se actualiza con `effectiveWatermarkFloor` en los `ToolPruningEpochEntry` posteriores.
  - **Consecuencia 1 — `Message Edit`**: cuando el usuario edita un **Message** anterior (`navigateTree`, `branch` o `resetLeaf` en `turn-runner.ts`), la hoja activa retrocede y cualquier `ToolPruningEpochEntry` posterior queda automáticamente en la **Abandoned Branch**, restaurando tanto los tool results podados como los escalones que se hubieran consumido en esa rama descartada.
  - **Consecuencia 2 — `Compaction` nativa de Pi**: `shouldCompact` en Pi evalúa `assistantMessage.usage` devuelto por el proveedor sobre el contexto **ya enmascarado**, por lo que **Tool Pruning** pospone de forma directa la **Compaction** de Pi. Cuando la sesión alcanza finalmente `contextWindow - reserveTokens` (`16 384`, `~90 %`), Pi ejecuta su **Compaction** nativa y escribe una entrada `type: "compaction"` en la rama: **los escalones `[0.45, 0.60, 0.75]` quedan rearmados automáticamente** para el nuevo ciclo de ventana mientras cualquier llamada ya podada dentro de la cola reciente conservada sigue enmascarada.

### D8. Arquitectura modular, frontera `jiti`, Subagents y Observabilidad

- **Estructura de código en `packages/coding-agent`**:
  - `extensions/tool-pruning/index.ts`: shell mínimo registrado automáticamente por `getFirstPartyExtensionPaths()` en `src/runtime/pi-packages.ts` (siguiendo el patrón de `extensions/artifacts/index.ts`).
  - `src/pruning/`: módulos puros y testeables en aislamiento:
    - `config.ts`: tipos y valores por defecto (`ToolPruningConfig`, `watermarks: [0.45, 0.60, 0.75]`).
    - `mask.ts`: proyección `applyPruningMask`, stub `head + tail` e invariantes de `AssistantMessage` / `ThinkingContent`.
    - `cooling-window.ts`: partición unificada entre **Cooling Window** y *Living Candidate Pool* + estimación de tokens.
    - `supersession.ts`: Fase 0 determinista y anotación de señales estructurales.
    - `decision-state.ts`: construcción y ajuste presupuestado del `state`, generación de preguntas `noul`, batching y aplicación de la política asimétrica (`0.25` / `0.15`).
    - `systemone-client.ts`: cliente HTTP sobre `fetch` contra `${baseUrl}/systemone` con soporte de timeout, `AbortSignal` y validación defensiva de respuesta.
    - `epoch-runner.ts`: reconstrucción de estado desde `getBranch()`, evaluación de escalones monotónicos (`watermarks`), orquestación de Fase 0 + Fase 1 y persistencia.
    - `pruning-bridge.ts`: puente ligero vía `Symbol.for` en `globalThis` (mismo patrón documentado en `src/subagent/subagent-bridge.ts`).
- **Resolución de credenciales y aislamiento frente a `jiti`**:
  - Pi carga `extensions/*/index.ts` mediante `jiti` en una instancia de módulos separada. Para evitar duplicar estado de configuración o romper el aislamiento de sandboxes en tests (`createTestWorkerContext()`):
    - `baseUrl` y `contextWindow` se leen directamente de `ctx.model` (`ctx.model.baseUrl` ya apunta a `${gatewayUrl}/v1` del sandbox o **Environment** activo).
    - `apiKey` se obtiene mediante `await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model)` desde el `ModelRuntime` inyectado en la sesión (sin leer `process.env` ni `config` global, cumpliendo ADR 0011 y ADR 0014).
    - `pruning-bridge.ts` (`Symbol.for("codingAgent.toolPruningBridge")`) solo transporta dos cosas entre el runtime del worker y `jiti`: (a) el sink real de `getTraceLogger("worker")` para no perder el `AsyncLocalStorage` de `tracing`, y (b) overrides opcionales de `ToolPruningConfig` inyectados desde `WorkerRuntimeConfig` en tests.
- **Subagents**: la extensión permanece activa tanto en sesiones padre como en **Subagents**. Al usar la misma escalera `[0.45, 0.60, 0.75]` en `pi.on("context")` y acotar el Turn en curso a `maxProtectedTurnTokens` (`40 000`), un **Subagent** corto no cruza el `45 %` (`0 ms`, `0` peticiones) y un **Subagent** de investigación profunda disfruta exactamente de los mismos 3 escalones progresivos que una sesión interactiva.
- **Observabilidad**:
  - **Sin elementos en UI en v1**: **Tool Pruning** es infraestructura transparente; el usuario conserva el transcript íntegro en la **Coding Agent UI**.
  - **Telemetría en sesión y trazas**: cada Epoch queda auditado en el propio `.jsonl` de la sesión (`ToolPruningEpochEntry`, inspeccionable por `trace-analyzer`) y emite eventos estructurados en `TraceLogger` (`tool_pruning.epoch_completed`, `tool_pruning.epoch_failed_open`).

### Resumen de parámetros por defecto (`ToolPruningConfig`)

| Parámetro | Valor por defecto | Función |
| --- | --- | --- |
| `enabled` | `true` | Activa/desactiva **Tool Pruning** (configurable en `WorkerRuntimeConfig` para tests). |
| `watermarks` | `[0.45, 0.60, 0.75]` | Escalones de `contextWindow`; consumir uno retira ese y los inferiores salvo los que queden `>= watermarkGapRatio` sobre el aterrizaje. |
| `watermarkGapRatio` | `0.15` | Margen mínimo (`15 %`) sobre el aterrizaje post-poda para rearmar un escalón y línea relativa `(watermark - gap)` de cortocircuito en Fase 0. |
| `minWorthwhilePruneTokens` | `8_000` | Mínimo de tokens podables fuera de la **Cooling Window** para disparar un escalón. |
| `minJudgeWorthwhileTokens` | `4_000` | Mínimo restante tras Fase 0 para justificar la llamada HTTP a `/v1/systemone`. |
| `coolingRecentTokens` | `16_000` | Cola mínima reciente protegida siempre en la **Cooling Window**. |
| `minCoolingToolCalls` | `6` | Número mínimo de tool calls recientes protegidas siempre. |
| `maxProtectedTurnTokens` | `40_000` | Tope absoluto de protección para el Turn activo o el último Turn completado con tools (`cap / 2` si lo excede). |
| `maxProtectedTurnRatio` | `0.20` | Tope relativo por ventana (`min(40_000, 0.20 * contextWindow)`) para no bloquear ventanas de `100k`. |
| `stubHeadChars` / `stubTailChars` | `150` / `150` | Caracteres conservados al principio y al final en `drop_result` (mínimo `380` chars para truncar). |
| `errorTruncateMinChars` | `2_000` | Tamaño mínimo para permitir `drop_result` sobre un `ToolResultMessage` con `isError: true`. |
| `maxDecisionStateTokens` | `20_000` | Presupuesto máximo del `state` enviado a `decision-default`. |
| `maxQuestionsPerBatch` / `maxDecisionBatches` | `80` / `3` | Límite de preguntas por petición y concurrencia máxima hacia `/v1/systemone`. |
| `dropResultThreshold` / `dropCallThreshold` | `0.25` / `0.15` | Umbrales `noul` conservadores (`keepResult < 0.25`, `keepCall < 0.15`). |
| `decisionTimeoutMs` | `4_000` | Timeout máximo por petición hacia `/v1/systemone` antes de *fail-open*. |

## Testing Decisions

- **Extensión del toolkit oficial `@ai-chatbot/model-gateway-testing` (`packages/model-gateway/js`)**:
  - `scenario.ts` ya enruta `POST /v1/systemone` hacia `config.decisions`, pero `decisionsResponse` en `protocol.ts` solo renderiza preguntas `type: "choice"`.
  - Se ampliará `decisionsResponse` para soportar preguntas `type: "noul"` (devolviendo respuesta numérica en `[0, 1]`, con `0.5` por defecto y overrides declarativos `nouls?: Readonly<Record<string, number>>` validados contra las claves de `request.questions`), manteniendo todos los tests en la costura HTTP oficial (MSW en unit tests y **Mock Model Gateway** en `:4001`).
- **Tests unitarios de dominio puro (`packages/coding-agent/tests/unit/pruning/`)**:
  - **Proyección e invariantes (`mask.test.ts`)**: preservación de emparejamiento `toolCallId`, `AssistantMessage` con múltiples tool calls, preservación/omisión correcta de `ThinkingContent`, formato `head + tail`, omisión de imágenes y no-truncado de resultados cortos (`<= 380` chars).
  - **Política por tool y Error Gate (`policy.test.ts`)**: `bash` nunca recibe `drop_call`, `edit`/`write`/`subagent`/`publish_artifact` y tools desconocidas siempre `keep`, errores cortos intactos y errores `> 2_000` chars limitados a `drop_result`.
  - **Cooling Window (`cooling-window.test.ts`)**: caso *Explorar (Turn 1) → Conversar en prosa sin tools (Turn 2) → Editar (Turn 3)*, y Turn único gigante (`> 40k` tokens, tanto completado como en curso).
  - **Fase 0 determinista (`supersession.test.ts`)**: `read` completo superado por `read` o `write` posterior, `read` con `offset/limit` cubierto vs parcial, distinción `drop_call` vs `drop_result` cuando media un `edit`, y cortocircuito sin llamada HTTP.
  - **Estado, batching, política y escalones (`decision-state.test.ts`, `epoch-runner.test.ts`)**: ajuste a `20k` tokens comprimiendo prosa antes que `args`/`preview`, 1 pregunta para `bash` vs 2 para exploratorias, política asimétrica (`0.25` / `0.15`), progresión monotónica de escalones `[0.45, 0.60, 0.75]` (usar `0.60` desactiva `0.45` y `0.60`), y rearme automático tras una entrada `compaction`.
- **Tests de integración en proceso del worker (`packages/coding-agent/tests/unit/pruning/session-integration.test.ts`)**:
  - Usando `createTestWorkerContext()` + `setupWorkerGatewayHarness()` (MSW, sin tocar `.pi-prod`/`.pi-dev` ni `process.env`):
    1. Sesión por debajo del primer watermark (`< 45 %`): `0` llamadas a `/v1/systemone` y contexto idéntico byte a byte.
    2. Progresión por escalones: cruce del `45 %` (o salto directo al `60 %` que deja el contexto en `50 %`), verificando que en el Turn siguiente al `54 %` **no** vuelve a disparar y que solo vuelve a ejecutar un Epoch al cruzar el siguiente escalón superior (`60 %` / `75 %`), manteniendo intacto el transcript devuelto a la **Coding Agent UI**.
    3. Recarga en frío de la sesión desde disco (`SessionManager` / `SessionRegistry`): las máscaras y los escalones consumidos de `ToolPruningEpochEntry` se reconstruyen sin volver a llamar a `/v1/systemone`.
    4. **Message Edit y Compaction**: tras podar en un Turn posterior y rebobinar a un **Message** previo, la máscara y el escalón consumido en la **Abandoned Branch** dejan de aplicarse; y tras una entrada `compaction` de Pi, los escalones `[0.45, 0.60, 0.75]` vuelven a quedar armados.
    5. **Fail-open**: error `500` o timeout en `/v1/systemone` no rompe el Turn, consume el escalón actual evitando reintentos en bucle y deja las candidatas elegibles para el siguiente escalón.

## Out of Scope

- Sustituir o modificar la **Compaction** por resumen del Chatbot (`packages/chatbot/lib/features/compaction/`).
- Ocultar o desactivar definiciones de tools activas (`pi.setActiveTools`).
- Resumir, parafrasear o reescribir mensajes de usuario o de asistente (eso pertenece exclusivamente a la **Compaction** cuando actúa como techo final).
- Indicadores visuales o controles manuales de **Tool Pruning** en la **Coding Agent UI** en v1.
- Poda síncrona de un único `tool_result` antes de que el modelo lo lea por primera vez (los límites deterministas por llamada individual —`2 000` líneas / `50 KB` en las tools `read` y `bash` de Pi— ya cubren ese caso sin latencia de red).

## Puntos de calibración

1. **Escalones con rearme por margen (`watermarks = [0.45, 0.60, 0.75]`, `watermarkGapRatio = 0.15`)**: separados un `15 %` entre sí y dejando otro `15 %` hasta la **Compaction** nativa de Pi (`~90 %`). Evitan *thrashing* cuando el suelo irreducible de la sesión supera un escalón y a la vez permiten reciclar escalones superiores tras limpiezas profundas (`>= 15 %` de holgura).
2. **Umbrales `noul` (`dropResult = 0.25`, `dropCall = 0.15`)**: priorizan cero *regret* sobre agresividad máxima en todos los escalones.
3. **Cooling Window (`último Turn con tools` y Turn activo acotados a `min(40k, 0.20 * contextWindow)` + mínimo `16k` tokens / `6` calls)**: protege un ciclo completo de *explorar → discutir → editar* sin bloquear ventanas de `100k` ni inmortalizar lecturas más allá de su ventana de uso real.
