# Rediseño Tool Calls — estilo Codex

> Fecha: 2026-08-25 · Estado: draft (uncommitted) · Scope: `packages/chatbot/components/code/*`

## 1. Contexto y objetivo

La conversación del coding agent renderiza cada tool call como una pill a ancho completo (`<details class="rounded-md border bg-card">` en [`packages/chatbot/components/code/tool-call-group.tsx`](file:packages/chatbot/components/code/tool-call-group.tsx)): icono + nombre en negrita + summary + icono de estado (spinner/check/X) + chevron. Ocupa mucho espacio vertical y no distingue visualmente los estados más allá del icono.

El objetivo es un rediseño compacto inspirado en Codex (screenshot referencia 1):

- Fila colapsada: icono + texto en una sola línea, sin borde/caja, a ancho contenido (no full-width), color apagado.
- Estado running: efecto shimmer en el texto. Ok: normal apagado. Error: rojo.
- Expandible (opción A elegida): clic en la fila despliega el detalle.
- Detalle: borde izquierdo como el desplegable de sessions del sidebar (`ml-2 pl-4 border-l-2 border-zinc-300 dark:border-zinc-600`) y, a su derecha, secciones **Parameters** y **Result** en contenedores redondeados con beautify/syntax highlight (referencia 2, JSON con highlight, output tabular). Opción A de highlight: args JSON pretty-printed + shiki, result autodetección JSON/plaintext.
- Sin header agrupador ("Used N tools"): filas sueltas inline dentro del flujo del mensaje (opción A).
- Summary con truncado más agresivo que el actual `flex-1 truncate`.

Fuera de scope: `components/chat` (el chat principal no renderiza tool calls persistentes; solo `LoadingMessage` transitorio). No se toca el protocolo AG-UI ni los tipos `ToolCallGroup`.

## 2. Estado actual

### 2.1 Componentes implicados

| Archivo | Rol |
|---|---|
| `components/code/tool-call-group.tsx` | Pill actual (`<details>` + `<summary>` + `ToolCallGroupBody`). Mapea `TOOL_ICONS`/`TOOL_DISPLAY_NAMES`. Body solo monta al abrir (`{open && <Body/>}`), con clamp 20 líneas + "Show more". |
| `components/code/agent-message.tsx` | Renderiza `toolGroups?.map(g => <ToolCallGroup>)` dentro de `role === "assistant"` antes del texto. |
| `components/ui/shimmer.tsx` | `Shimmer` (motion, `backgroundPosition` gradient, `bg-clip-text`). Hoy solo acepta `children: string`. Usa `--spread = len * spread`. |
| `lib/features/code/file-browser/highlight.ts` | `tokenize(content, language, theme): Promise<ThemedToken[][]>` + `DARK_THEME`/`LIGHT_THEME` ("github-dark"/"github-light"). Usado por file-browser con `useTheme().resolvedTheme`. |
| `components/layout/sidebar/agent-code-section.tsx` | Referencia visual del borde izquierdo del detalle. |
| `tests/component/agent-code/tool-call-group.test.tsx` | 5+ tests que asumen `<details>` (abren vía `details.open + toggle`). |

### 2.2 Tipos

```ts
// lib/features/code/types.ts
interface ToolCallGroup {
  id: string; name: string; args: string; argsParsed?: unknown;
  result?: string; status: ToolCallStatus; // "running" | "ok" | "error"
  startedAt?: number; finishedAt?: number; summary: string;
}
```

## 3. Diseño propuesto — Enfoque 2 (extraer unidades)

Se mantiene `ToolCallGroup` como orquestador pero se extraen dos unidades con responsabilidad única.

### 3.1 Mapa de ficheros

```
components/code/tool-call-group.tsx   — reescrito: fila compacta + estado open + delega detalle
components/code/tool-call-detail.tsx  — NUEVO: contenedor borde izquierdo + Parameters/Result + CodeContainer
components/code/highlighted-code.tsx  — NUEVO: renderizador shiki async reutilizable
components/ui/shimmer.tsx              — ajuste menor: aceptar ReactNode
tests/component/agent-code/tool-call-group.test.tsx — actualizar (ver §7)
```

Ningún cambio en `agent-message.tsx` (sigue mapeando `toolGroups` igual) ni en `types.ts`.

### 3.2 `tool-call-group.tsx` — fila colapsada

**Estructura visual (colapsado):**

```
[Icon 16px text-muted-foreground]  [Nombre medium]  [summary truncate muted]     (todo en una línea)
```

- Contenedor fila: `button` (no `<details>`) con `aria-expanded`, `w-fit max-w-full flex items-center gap-2 py-1.5 text-sm` — sin border/bg, no full-width.
- Icono: `size-4` `text-muted-foreground` (hereda rojo en error, ver estados).
- Nombre: `font-medium` (ej. "Shell", "Read").
- Summary: `truncate` con `max-w-48` (12rem, ~30-36ch) — truncado agresivo pedido; `flex-1 min-w-0` eliminado. `text-muted-foreground` en ok/running, rojo en error.
- Sin chevron. Toda la fila clickeable. `hover:bg-muted/40 rounded-md -mx-1 px-1` sutil.
- Ancho: `w-fit max-w-full` — la fila solo ocupa lo que necesita, no 100%.
- Accesibilidad: `aria-expanded`, `aria-controls`, foco visible (`focus-visible:ring-1`).

**Estados:**

| status | texto fila | icono |
|---|---|---|
| `running` | shimmer (ver §3.4) sobre el bloque de texto; color base `text-muted-foreground` apagado | mismo shimmer o `text-muted-foreground` |
| `ok` | `text-muted-foreground` normal | `text-muted-foreground` |
| `error` | `text-red-600 dark:text-red-400` | `text-red-600 dark:text-red-400` |

No se muestran spinner/check/X en la fila (el color + shimmer comunican el estado). YAGNI: el detalle expandido puede mostrar un check/tilde si se quiere, pero se omite por ahora (segunda imagen muestra "Accepted" con ✓ — no se replica; el color rojo en error es suficiente).

**Interacción:**

- `const [open, setOpen] = useState(false)` (igual que ahora).
- Click / Enter / Space togglea `open`.
- `useCallback` para toggle estable (memo sigue aplicando).
- `React.memo` con comparador custom se conserva (mismo que hoy).

### 3.3 `tool-call-detail.tsx` — detalle expandido

Solo monta cuando `open === true` (se conserva la optimización: el padre hace `{open && <ToolCallDetail/>}`, así mil tool calls no montan bodies).

**Layout:**

```
<div class="ml-2 pl-4 my-2 border-l-2 border-zinc-300 dark:border-zinc-600 flex flex-col gap-4">
  <!-- Parameters -->
  <div>
    <div class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-1.5">Parameters</div>
    <div class="rounded-lg border border-border bg-muted/20 overflow-hidden">
      <HighlightedCode content={prettyArgs} language="json" />
    </div>
  </div>

  <!-- Subagent link (si name === "subagent" y hay fileBrowserIds) -->
  <SubagentToolLink ... />

  <!-- Result (solo si result !== undefined) -->
  <div>
    <div class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase mb-1.5">Result</div>
    <div class="rounded-lg border border-border bg-muted/20 overflow-hidden">
      <HighlightedCode content={clampedResult} language={detectedLang} />
      {clamped && <button ...>Show more</button>}
    </div>
  </div>
</div>
```

Notas:

- Labels en uppercase `PARAMETERS` / `RESULT` replican referencia 2 (all-caps, pequeño, muted, tracking).
- Contenedores: `rounded-lg border border-border` con fondo sutil (`bg-muted/20` o `bg-zinc-950` en dark si se quiere contraste; usar token existente para no introducir color ad-hoc — `bg-card` + border es suficiente y respeta theming). `overflow-hidden` + `overflow-x-auto` en el bloque de código.
- `prettyArgs`: `try { JSON.parse(args); JSON.stringify(parsed, null, 2) } catch { args }`. Si `args` es `""` o `"{}"` mostrar placeholder muted "(no parameters)".
- `detectedLang` para result: helper `detectResultLanguage(result)` — `try JSON.parse → "json"`, else `"plaintext"`. Si es JSON objeto/array re-stringify pretty para highlight vertical; si es JSON primitivo o texto, se deja tal cual.
- Clamp 20 líneas se conserva: se aplica a `result` crudo antes de highlight. `const lines = result.split("\n"); const clamped = lines.length > 20 && !expanded; const visible = clamped ? lines.slice(0,20).join("\n") : result`. Highlight solo corre sobre `visible`; al hacer "Show more" se re-tokeniza con el contenido completo. Alternativa (más simple): highlight completo y clamp visual con `max-h + overflow` — se elige clamp lógico para no tokenizar 50k líneas innecesarias.
- "Show more": `block w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 border-t border-border` — dentro del contenedor.
- Error result: `HighlightedCode` recibe `isError` y aplica `text-red-600 dark:text-red-400` a los tokens (override de color) o, más simple, el contenedor lleva clase de error y `HighlightedCode` lo respeta. Decisión: fallback plaintext en error no necesita highlight; clases de error en el `<pre>` wrapper.
- Borde izquierdo exactamente `ml-2 pl-4 my-2 border-l-2 border-zinc-300 dark:border-zinc-600` (mismo que `agent-code-section.tsx:182`).

### 3.4 `highlighted-code.tsx` — renderizador shiki

**Props:**

```ts
interface HighlightedCodeProps {
  content: string;
  language: string; // "json" | "plaintext" | ...
  className?: string;
}
```

**Comportamiento:**

- Client component (`"use client"`).
- Lee `const { resolvedTheme } = useTheme()` y deriva `theme = resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME`.
- `useEffect` con cancelación: `let cancelled = false; tokenize(content, language, theme).then(tokens => { if (!cancelled) setTokens(tokens) })`. Incluye `content`, `language`, `theme` en deps.
- Mientras `tokens === null`: renderiza `<pre class="p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto text-muted-foreground">{content}</pre>` (sin colores, sin layout shift).
- Cuando resuelve: `tokens: ThemedToken[][]` →

  ```tsx
  <pre className={cn("p-3 text-xs font-mono whitespace-pre-wrap overflow-x-auto", className)}>
    {tokens.map((line, i) => (
      <div key={i} className="leading-5">
        {line.length === 0 ? "\n" : line.map((tok, j) => (
          <span key={j} style={{ color: tok.color }}>{tok.content}</span>
        ))}
      </div>
    ))}
  </pre>
  ```

  Patrón idéntico a `CodeViewLine` (`<span style={{color: token.color}}>`).

- Si `content === ""`: renderiza placeholder muted.
- Manejo de error de `tokenize` (lang no soportado): cae a `plaintext` internamente (ya lo hace `tokenize`), si aún falla renderiza plaintext sin highlight.
- No se usa `highlighter` singleton fuera del helper; se reutiliza `highlight.ts` tal cual.
- Performance: solo se monta dentro de `ToolCallDetail` que a su vez solo monta abierto; tokenize no bloquea el render inicial (async + fallback plaintext).

**Theming:** usa exactamente los mismos `LIGHT_THEME`/`DARK_THEME` que file-browser, por lo que el highlight respeta el toggle de tema sin CSS extra.

### 3.5 `components/ui/shimmer.tsx` — generalización mínima

Actual: `children: string`, usa `children.length * spread` para `dynamicSpread`.

Cambio:

- `children: React.ReactNode` y nuevo prop opcional `textLength?: number` (para spread). Si `textLength` no se pasa y `children` es string, se usa `children.length`; si es ReactNode, se usa `String(children).length` fallback o un spread fijo razonable (ej. 24px).
- Render sigue siendo `motion.create(as)` con mismo gradient/background logic; ahora puede envolver `<span><span class="font-medium">Shell</span> <span>ls -la</span></span>` y el `bg-clip-text` del padre aplica a todos los descendientes (los hijos no fijan `color`, heredan `text-transparent`).
- Alternativa sin tocar Shimmer: aplicar las clases de shimmer (`bg-[length:250%_100%] bg-clip-text text-transparent [...]`) directamente en `tool-call-group.tsx` con un `motion.span`. Se prefiere generalizar `Shimmer` porque es un componente de diseño compartido ya usado por `ReasoningBlock` y la generalización es de 4 líneas.

Uso en la fila running:

```tsx
{group.status === "running" ? (
  <Shimmer as="span" className="inline-flex items-center gap-1.5 text-sm" textLength={group.name.length + group.summary.length}>
    <span className="font-medium">{displayName}</span>
    <span className="truncate max-w-48">{group.summary}</span>
  </Shimmer>
) : (
  <span className={cn("inline-flex items-center gap-1.5", statusColor)}>
    <span className="font-medium">{displayName}</span>
    <span className="truncate max-w-48">{group.summary}</span>
  </span>
)}
```

Icono fuera del Shimmer (no se shimmerea el icono; solo texto — replica Codex donde el icono es estático y el texto shimmerea).

## 4. Flujo de datos

```
AG-UI events → useAgentCodeChat → groupItems(messages) → ToolCallGroup[] (status/summary/args/result)
                                      ↓
                              AgentMessage (assistant) → ToolCallGroup × N
                                                          ├─ fila: Icon + Shimmer|span (status) + summary
                                                          └─ {open && <ToolCallDetail>}
                                                                      ├─ prettyArgs → HighlightedCode(json)
                                                                      ├─ SubagentToolLink?
                                                                      └─ clamp(result) → HighlightedCode(detectedLang)
```

Sin cambios en el agrupamiento ni en el store. `agent-message.tsx` no se toca.

## 5. Manejo de errores y casos borde

- **args no es JSON válido:** se muestra raw `args` en plaintext sin pretty. No crashea.
- **args vacío/null:** placeholder "(no parameters)" muted.
- **result undefined (running):** sección Result no se renderiza (igual que hoy).
- **result muy largo (miles de líneas):** clamp 20 + "Show more" evita tokenizar/renderizar todo de golpe. "Show more" expande y re-tokeniza.
- **tokenize falla o tarda:** fallback plaintext inmediato; cuando resuelve, reemplaza sin flicker. Cancelación evita setState en desmontado o contenido stale si el usuario colapsa rápido.
- **Tema cambia mientras highlight está cargando:** deps incluyen `theme`, se re-tokeniza.
- **content muy grande + JSON pretty:** pretty puede inflar líneas; el clamp sigue operando sobre el pretty para acotar.
- **Subagent sin fileBrowserIds:** `SubagentToolLink` no se renderiza (guard existente).
- **Truncado agresivo oculta info clave:** hover `title={summary}` en la fila para tooltip nativo.
- **Accesibilidad:** fila es `<button>` con `aria-expanded`; teclado Enter/Space; `HighlightedCode` usa `<pre>` semántico.

## 6. Estilo y theming

- Reutiliza tokens Tailwind existentes: `text-muted-foreground`, `border-border`, `bg-muted/20`, `bg-card`, `text-red-600 dark:text-red-400`.
- Dark mode: `tokenize` ya resuelve por `resolvedTheme`; contenedores usan `border-border` (adapta); texto rojo usa par dark.
- Fuente mono para código: `font-mono text-xs` (consistente con file-browser).
- No se introducen nuevos colores hardcodeados ni animaciones CSS custom; shimmer es el existente de `Shimmer` (motion).

## 7. Testing

### 7.1 Tests existentes a actualizar

`tests/component/agent-code/tool-call-group.test.tsx`:

- Hoy abre con `details.open + toggle`. Migrar a: `getByRole("button", { expanded: false })` + `fireEvent.click(button)` y asertar `aria-expanded`.
- Tests que verifican que colapsado no renderiza Args/Output → siguen válidos (ahora buscan "Parameters"/"Result" ausentes).
- Tests de clamp 20 líneas + "Show more" → adaptar selector (ahora dentro de `HighlightedCode` container).
- Añadir casos: running aplica shimmer (assert `Shimmer` presente o clase `bg-clip-text`), error aplica clase roja, summary truncado tiene `title`.

### 7.2 Nuevos tests (scope del plan)

- `highlighted-code.test.tsx` (component): renderiza con `content='{"a":1}' language="json"` y verifica que aparecen spans con `style.color` (mock `tokenize` si hace falta; o integración ligera con shiki — vitest jsdom puede cargar shiki wasm? Mockear `highlight.ts` es más estable).
- `tool-call-detail.test.tsx`: renderiza con `args` JSON y `result` largo; verifica labels "Parameters"/"Result", clamp y "Show more", y que `SubagentToolLink` aparece solo cuando corresponde.
- Snapshot visual opcional no requerido; tests se centran en comportamiento.

### 7.3 E2E / contrato

Sin cambios de contrato externo. Contrato AG-UI intacto.

## 8. Plan de implementación (resumen para writing-plans)

1. Generalizar `Shimmer` (`children: ReactNode`, `textLength?`).
2. Crear `highlighted-code.tsx` (con tests).
3. Crear `tool-call-detail.tsx` (con tests).
4. Reescribir `tool-call-group.tsx` (fila compacta + delegación) y migrar tests existentes.
5. Verificación manual: tema claro/oscuro, running shimmer, error rojo, expand/collapse, clamp, subagent link, truncado agresivo con tooltip.

## 9. Alternativas descartadas

- **Restyle in situ sin extraer:** ahorra ficheros pero mezcla highlight async + layout del detalle en un solo componente de 300+ líneas; testabilidad peor.
- **Header "Used N tools":** descartado por decisión (opción A sin header) — añade ruido y el bloque de filas ya agrupa.
- **Highlight solo plaintext:** pierde el beautify pedido para JSON de Parameters/Result.

## 10. Riesgos

- **Shiki async puede tardar en primera carga (wasm/highlighter init):** mitigado con fallback plaintext inmediato; el highlight aparece progresivamente.
- **Cambio de `<details>` a `<button>` rompe tests existentes:** migración explícita en §7.1; jsdom no tiene `<details>` quirks, el nuevo patrón es más testeable.
- **Truncado agresivo puede esconder summary útil:** tooltip `title` y el detalle expandido siempre muestra el summary completo vía `prettyArgs`/`result`.

