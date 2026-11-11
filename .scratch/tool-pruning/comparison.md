# Comparativa — tres approaches de Tool Pruning

Status: working document, 2026-11-11.

Compara:

- **fast-jev-compaction** (`/tmp/fast-jev-compaction` @ `e3f262a`): eviction en
  Compaction, historial completo, destructiva.
- **winnow** (`/tmp/winnow` @ `4547a81`): admission control en la ingesta de
  cada tool result, por bloques, reversible con recall.
- **Nuestro diseño** (`.scratch/tool-pruning/spec.md`, D1–D7): eviction al
  inicio de cada Turn, solo el Turn anterior, no destructiva, irreversible.

## TL;DR

Los tres usan un modelo de decisión tipo System One (`noul` / probabilidad
calibrada) para decidir qué contenido no hace falta. La diferencia no es el
modelo: es **cuándo se decide, sobre qué unidad y si se puede deshacer**.

| | fast-jev | winnow | Nuestro diseño |
|---|---|---|---|
| Enfoque | expulsión al compactar | admisión al ingerir | expulsión por Turn |
| Unidad | tool call + result | bloque de ~25 líneas | tool call + result |
| Disparo | contexto ≥60% o `/compact` | resultado ≥1500 chars | Turn nuevo |
| Alcance | todo el historial | un resultado cada vez | solo el Turn anterior |
| Reversible | no | sí, con recall | no (D6) |
| Destructivo | sí, reescribe la sesión | no, solo lo que ve el modelo | no, solo el `context` |

## 1. Qué hace cada uno

### fast-jev-compaction

Cuando Claude Code compacta (auto-compaction o `/compact`, y además un hook
propio que dispara al 60% al final de un Turn), manda **toda la conversación**
a Jev: textos, inputs de las tool calls y una nota por resultado
(`ok, 4213 chars (omitted)`). Pregunta dos `noul` por call: ¿la call sigue
importando? ¿el resultado sigue haciendo falta verbatim? Con `keepThreshold`
0.5 decide `keep`, `drop_result` (conserva 300 chars de cabeza + nota) o
`drop_call` (borra call y result). Reconstruye el historial y **lo escribe en
la sesión**. No hay resumen ni recall: lo que cae, cae. Si la reducción es
menor del 25% o Jev falla, delega en el summary nativo.

### winnow

En un function hook `tool.call`, después de ejecutar `Read`, `Bash` o `Grep` y
antes de devolver el resultado al modelo, parte el texto en bloques de ~25
líneas (máx. 200 bloques; el tamaño crece si hace falta) y manda al judge un
state local: la tarea (último user request + última intención del asistente,
sacados del tail del transcript), la tool con su input, y los bloques
completos. Pregunta un `noul` por bloque («¿el asistente tendría que mirar
este bloque para hacer bien la tarea?») más una pregunta de error compartida.
Solo oculta los bloques con `p < 0.1`; los de la banda 0.1–0.5 se conservan
como inciertos. Cada grupo oculto se sustituye por un stub de tres líneas:
rango de líneas, probabilidad, un summary de Haiku (o un digest determinista)
y una clave de caché. El texto completo queda en `~/.winnow/cache/` y el
modelo puede recuperarlo con `winnow_recall(key, start, end)`. El transcript
de Claude Code no se toca; solo cambia lo que el modelo ve.

### Nuestro diseño

Al inicio de cada Turn, una llamada de decisión bloqueante evalúa las tool
calls del Turn inmediatamente anterior. Dos `noul` por candidata (call y
result) y `keepThreshold`; una política por tool (D5) restringe qué acciones
son válidas por tipo. La decisión es definitiva (D6) y, si la llamada falla,
se conservan todas las tools (D7). No se reescribe la sesión: solo se filtra
el array de mensajes que recibe el LLM en el evento `context`; el fichero de
sesión, el log AG-UI y el transcript del usuario conservan todo. La Compaction
de Pi sigue siendo el backstop.

## 2. Tablas por dimensión

### 2.1 Qué, cuándo y dónde

| Dimensión | fast-jev | winnow | Nuestro diseño |
|---|---|---|---|
| Qué se quita | tool calls y results | bloques dentro de un resultado | tool calls y results |
| Unidad de decisión | call + su result | bloque | call + su result |
| Cuándo | al compactar | al ingerir el resultado | al inicio del Turn |
| Disparador | presión de contexto (60%) o `/compact` | tamaño (≥1500 chars) | Turn nuevo |
| Alcance | todo el historial | un resultado cada vez | solo el Turn anterior |
| Dónde vive | hook de Claude Code + librería TS | function hook TS + sidecar Python | extensión de Pi en el worker |
| ¿Sustituye la Compaction? | sí, la reemplaza | no, la deja intacta | no, la deja como backstop |

### 2.2 Qué ve el judge y qué pregunta

| Dimensión | fast-jev | winnow | Nuestro diseño |
|---|---|---|---|
| State | conversación completa: textos + inputs + notas de results | task + tool + bloques completos | Q1 abierta |
| Goal | últimos 3 prompts (≤500 chars) | último user request (cabeza) + última intención (cola) | pendiente |
| ¿Ve el cuerpo del resultado? | no, solo `ok, N chars` | sí, los bloques | no (D4) |
| Preguntas | 2 `noul` por call | 1 `noul` por bloque + 1 `error_present` | 2 `noul` por call (D4) |
| Phrasing | una frase por pregunta, sin criteria | `structured` (what / not_for / examples) por defecto | como la referencia |
| Pinned | primer mensaje + últimos 6 | ninguno; excluye sus propios ficheros | Turn anterior entero; ventana pendiente |
| Fitting | 25k tokens de state, 30k de request, por etapas | 120k chars de bloques, 200 bloques máx. | Q1 |

### 2.3 Regla y efecto

| Dimensión | fast-jev | winnow | Nuestro diseño |
|---|---|---|---|
| Umbral | 0.5 simétrico | drop 0.1 / keep 0.5; la banda incierta se conserva | `keepThreshold` (D4) + política por tool (D5) |
| Error gate | no | sí: si P(error) ≥0.5, no oculta nada | no definido |
| Mínimo de reducción | 25% o fallback al summary | 20% o no reescribe | no definido |
| Acciones | keep / drop_result (head 300 + nota) / drop_call | keep / hide (stub de 3 líneas) | keep / drop_result / drop_call según D5 |
| Resumen | no | sí: Haiku (máx. 4 grupos) o digest | no |
| Reversibilidad | ninguna | recall: cache + `winnow_recall` | ninguna (D6) |
| Efecto en el transcript | reescribe el historial de la sesión | no lo toca; solo lo que ve el modelo | no lo toca; solo el array `context` |
| Fallo | throw → fallback al summary | pass-through | fail open (D7) |

### 2.4 Riesgo, coste y madurez

| Dimensión | fast-jev | winnow | Nuestro diseño |
|---|---|---|---|
| Falso negativo | pérdida permanente; la tool se puede re-ejecutar | recuperable con recall; cuesta un tool call | pérdida permanente para el modelo; recuperable out-of-band |
| Sesgo | agresivo (0.5) | conservador (0.1 + inciertos) | conservador por D6 |
| Coste por decisión | una pasada grande al 60%; state 25k | por resultado grande; hasta 120k chars | por Turn; state Q1 |
| Latencia | no medida en su README; nuestro probe: 0,95 s para 80 preguntas y 6,2k tokens | ~86 ms mediana por caso con Jev + 16 ms de sidecar | ~1 s con 10k (probe, otro modelo) |
| Evals | stats + decision log; sin replay | shadow + replay + labels + ECE/AUC + regret + review | pendiente |
| Madurez | librería + plugin + tests | sidecar + plugin + tests + benchmark | diseño D1–D7, sin código |

Las latencias no son comparables: 86 ms es Jev en el benchmark de winnow;
0,95 s es `decision-default` (Microsoft Decision-1) en nuestro probe.

## 3. Los tres ejes que explican las diferencias

### 3.1 Admisión vs expulsión

Winnow decide **antes** de que el contenido entre en contexto. Los otros dos
deciden **después**, sobre contenido que ya ocupó ventana.

- La admisión nunca invalida un prefijo ya cacheado: el resultado llega ya
  filtrado. La expulsión sí cambia el prefijo desde el punto donde se aplica.
- La admisión decide sin saber qué pasará después; solo ve el resultado y la
  tarea que lo motivó.
- La expulsión puede usar lo que pasó después (supersesión, cambio de
  objetivo), que es justo lo que necesita una decisión temporal como la
  nuestra.

### 3.2 Estado local vs global

- **Winnow: local.** Tarea + tool + bloques. Suficiente para «¿este contenido
  hace falta para la tarea actual?».
- **Fast-jev: global.** Conversación completa. Necesario para «¿esta call
  sigue haciendo falta dado todo lo que vino después?».
- **Nuestro caso: temporal.** La pregunta es si el Turn anterior sigue
  importando para lo que viene. El mínimo es el Turn anterior + el goal; el
  historial completo añade supersesión y restricciones viejas. Eso es
  exactamente Q1.

### 3.3 Reversible vs irreversible

- **Winnow puede ser agresivo con el umbral (0.1)** porque el texto sigue en
  caché y el modelo puede recuperarlo. El precio es un stub, un cache, un MCP
  tool y una clave que el modelo debe saber usar.
- **Fast-jev y nosotros no tenemos recall.** El umbral debe ser más
  conservador y el error gate importa más. D6 fija la irreversibilidad; la
  comparación sugiere que 0.5 es demasiado agresivo sin red.

## 4. Lo mejor de cada uno

### fast-jev

- State completo con goal: la única fuente para detectar supersesión.
- Dos preguntas por call: separa «el hecho de la llamada» de «el contenido».
- Fitting por etapas y batching: aguanta historiales grandes.
- Pinned + fallback al summary: la sesión nunca se queda sin Compaction.
- Simple: una pasada, sin caché ni sidecar.

### winnow

- Admisión: el contenido no entra y no invalida caché.
- Stub + recall: la decisión deja de ser una apuesta; el modelo recupera.
- Umbral conservador + banda de incertidumbre + error gate: mucha menos
  probabilidad de pérdida.
- Block-level: puede quitar solo las partes irrelevantes de un resultado
  grande, no el resultado entero.
- Evals de primera clase: replay, labels débiles y manuales, ECE/AUC, regret,
  shadow mode, review humano.

### Nuestro diseño

- **No destructivo**: sesión, AG-UI y transcript intactos; solo cambia el
  `context` del LLM. Ninguno de los otros dos tiene esta propiedad.
- **Política por tool (D5)**: no quita mutaciones ni el hecho de un `bash`.
- **Fail open (D7)**: un fallo del judge no rompe el Turn.
- **Persistencia por custom entries (Q2)**: las decisiones sobreviven a
  resume/reload.
- **Cadencia por Turn**: control fino, sin esperar al 60%.
- **Coste bajo**: dos preguntas por call, solo el Turn anterior.

## 5. Implicaciones para nuestro diseño

1. **El 0.5 es más agresivo que la evidencia de winnow.** Con `structured`,
   Jev oculta ~4,6% del texto a `drop=0.1` con 0% de bloques necesarios en esa
   banda; a `drop=0.3` oculta 22,6% con 21,3% de regret (label débil). Su banda
   0.1–0.5 se conserva. Nuestro `keepResult <0.5 → drop_result` y
   `keepCall <0.5 → drop_call` es simétrico y, con decisiones permanentes,
   arriesgado. Candidato: separar `dropThreshold` (0.15–0.2) de
   `keepThreshold` (0.5), o conservar la banda incierta. Toca D4, no D6.
2. **El judge no ve el resultado (D4).** Fast-jev puede decidir sin el cuerpo
   porque tiene toda la conversación. Nosotros tendremos el Turn anterior +
   goal, bastante menos; la falta de contenido pesa más. Candidato: incluir
   una cabeza del resultado (200–400 chars) en el state.
3. **Error gate.** Winnow nunca oculta un output con error. Nuestro D5 no lo
   dice. Candidato: si el resultado es `isError`, forzar `keep` (o al menos
   `drop_result`, nunca `drop_call`), independientemente del judge.
4. **Ingress vs Turn.** Winnow poda un `Read` gigante en el momento; nosotros
   esperamos al Turn siguiente. Si el objetivo es evitar la primera
   Compaction, un filtro de ingesta para outputs enormes es el complemento
   natural. No cambia D3/D6; es una capa aparte.
5. **Evals.** Copiar el enfoque de winnow: shadow mode, decision log con
   probabilidades, replay sobre trazas/sesiones, labels débiles, muestra
   manual, ECE/AUC. Nuestro «regret» no puede ser recall, pero sí «¿el modelo
   re-ejecutó la tool o releyó el fichero después?».
6. **Reversibilidad out-of-band.** No tenemos recall, pero la sesión conserva
   todo. Un comando de inspección que muestre qué se podó y permita restaurar
   en una sesión nueva sería el equivalente débil de `winnow_recall`, sin
   reabrir D6.

## 6. Preguntas que abre

- **Q1 (state)**: winnow sugiere que un state local basta para relevancia;
  fast-jev sugiere que el completo es necesario para supersesión. Nuestro caso
  es temporal, así que probablemente (a) o (b), no (c).
- **Q2 (persistencia)**: `decisions.jsonl` y el cache de winnow muestran el
  valor de un log durable; nuestras custom entries son el equivalente nativo
  de Pi.
- ¿Añadimos error gate y dos umbrales? (refinamiento de D4/D5)
- ¿Incluimos una cabeza del resultado en el state? (refinamiento de D4)
- ¿Medimos regret/evals desde el MVP?

## 7. Fuentes

- fast-jev: `/tmp/fast-jev-compaction` @ `e3f262a`; `src/state.ts`,
  `src/compact.ts`, `src/request.ts`, `hooks/fast-jev.ts`, `README.md`.
- winnow: `/tmp/winnow` @ `4547a81`; `README.md`, `docs/DESIGN.md`,
  `sidecar/src/winnow/{chunk,questions,policy,hooks,stub,mcp_server,transcript,config}.py`,
  `hooks/winnow.ts`.
- Nuestro: `spec.md` (D1–D7) y `reference-notes.md`.
