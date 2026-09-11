# Nunjucks como motor de render de prompts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la sustitución regex de `{{var}}` en `resolveProjectPrompt` por nunjucks (sintaxis Jinja2) — condicionales `{% if %}`/`{% elif %}`/`{% else %}`, bucles `{% for %}`, `{% set %}` — sin romper ninguna plantilla `.prompty` existente.

**Architecture:** Mismo catálogo y misma firma `resolveProjectPrompt(projectCwd, promptName, values) → { text }`. Solo cambia el paso de render (paso 4) y el post-pass de líneas vacías (paso 5). Un environment nunjucks singleton a nivel de módulo con `autoescape: false`, `trimBlocks: true`, `lstripBlocks: true`. El post-pass usa sentinelas por línea para distinguir líneas vacías-artefacto (tags que renderizaron a nada) de líneas en blanco intencionales, incluso cuando `trimBlocks` fusiona dos líneas de la plantilla en una sola línea renderizada.

**Tech Stack:** `nunjucks@^3.2.4` (dependency), `@types/nunjucks@^3.2.6` (devDependency), vitest (unit tests), Node 24 + pnpm 11.

## Global Constraints

- Dependencias: `nunjucks@^3.2.4` en `dependencies`; `@types/nunjucks@^3.2.6` en `devDependencies` del paquete `coding-agent`.
- Import: `import nunjucks from "nunjucks"` (CJS; el tsconfig del paquete ya tiene `esModuleInterop: true` y el import por defecto tipa contra los named exports de `@types/nunjucks`; verificado con tsc y tsx/vitest).
- En el entorno nunjucks: `autoescape: false` (el texto va a chat/textarea; escapar corrompería markdown y código), `trimBlocks: true`, `lstripBlocks: true`, `throwOnUndefined` en su default (`false` → variables ausentes renderizan `""`).
- No cargar `process.env` nuevo; no tocar `config`.
- Estilo del repo: punto y coma, comillas dobles, indentación de 2 espacios, `import type` para tipos.
- Todo commit incluye el trailer `Co-Authored-By: <modelo> <noreply@example.com>` (AGENTS.md raíz).
- Comandos de verificación:
  - Unit tests del paquete: `pnpm --filter coding-agent test:unit` (o filtrar por archivo: `pnpm --filter coding-agent test:unit resolve-prompt`; filtrar por test: añadir `-t "nombre"`).
  - Type check: `pnpm --filter coding-agent type:check`.
  - Lint: `pnpm --filter coding-agent lint`.
- Documentar en el código que los nombres de inputs deben ser `snake_case` (un input `foo-bar` se interpretaría como resta en nunjucks); sin validación extra.

## Desviaciones verificadas del design doc

Estas dos correcciones se descubrieron prototipando la implementación real; cada una está incorporada en las tareas de abajo:

1. **`lineno` no está disponible como propiedad.** La ruta síncrona `env.renderString(...)` NO lanza `nunjucks.lib.TemplateError` con propiedad `lineno`: lanza un `Error` plano con `name: "Template render error"` y el número de línea embebido en el mensaje: `(unknown path) [Line 3, Column 7]\n  unexpected token: %}`. El plan extrae la línea parseando el mensaje con `/\[Line (\d+), Column (\d+)\]/.`
2. **El post-pass indexado del design doc está roto con `trimBlocks`.** `trimBlocks` elimina newlines, así que el output renderizado puede tener MENOS líneas que la plantilla fuente; mapear por índice de línea (`lineHasTag[index]`) elimina líneas en blanco intencionales por desalineación. Ejemplo verificado: plantilla con `{% if %}` vacío produce `## Enfoque: bugs\n## Instrucciones` (pegadas, sin blank). Solución: sentinelas por línea (ver Task 2).

## File Structure

- `packages/coding-agent/package.json` — Task 1: añade `nunjucks` + `@types/nunjucks` (via `pnpm --filter coding-agent add`).
- `packages/coding-agent/src/prompts.ts` — Tasks 1-2: import de nunjucks, `promptEnv` singleton, helper `renderPromptBody(body, view)`, pasos 4-5 de `resolveProjectPrompt`, eliminar `escapeRegex`.
- `packages/coding-agent/tests/unit/resolve-prompt.test.ts` — Tasks 1-3: nuevos casos (condicionales, truthiness, bucles, `set`, errores con línea, llaves literales, post-pass de líneas vacías, builtin real).
- `packages/coding-agent/prompts/code-review-session.prompty` — Task 3: envolver `## Enfoque` y `{{extra_context}}` en `{% if %}`.

---

### Task 1: Migrar la sustitución regex a nunjucks + errores con número de línea

**Files:**
- Modify: `packages/coding-agent/package.json` (deps)
- Modify: `packages/coding-agent/src/prompts.ts` (import, `promptEnv`, `renderPromptBody`, pasos 4-5, borrar `escapeRegex`)
- Test: `packages/coding-agent/tests/unit/resolve-prompt.test.ts`

**Interfaces:**
- Consumes: el pipeline actual de `resolveProjectPrompt` (pasos 1-3 intactos: validación de `required`, lectura del body, `renderInputValue`).
- Produces: helper interno `renderPromptBody(body: string, view: Record<string, string>): string` — renderiza con nunjucks y aplica el post-pass de líneas vacías (Task 1: el post-pass indexado actual, movido tal cual). La firma pública `resolveProjectPrompt(projectCwd, promptName, values) → { text }` NO cambia. El error de sintaxis nunjucks se relanza envuelto: `Prompt "<name>": error de plantilla en línea <N> de <filePath>: <mensaje original>`.

- [ ] **Step 1: Añadir los tests que fallan (condicionales, truthiness, bucle, set, error de sintaxis)**

Añadir al final de `describe("resolveProjectPrompt", ...)` en `tests/unit/resolve-prompt.test.ts`:

```ts
  it("renders {% if %}/{% elif %}/{% else %} conditionals", () => {
    const condRoot = join(tmpRoot, "conditional-project");
    const promptsDir = join(condRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "classify.prompty"), `---
name: classify
description: Conditional
inputs:
  - name: type
    kind: string
    description: Tipo
    enumValues: [bug, perf, style]
---

{% if type == "bug" %}
BUG
{% elif type == "perf" %}
PERF
{% else %}
OTRO
{% endif %}`);

    loadPrompts(condRoot);
    expect(resolveProjectPrompt(condRoot, "classify", { type: "bug" }).text).toBe(
      "BUG",
    );
    expect(resolveProjectPrompt(condRoot, "classify", { type: "perf" }).text).toBe(
      "PERF",
    );
    expect(resolveProjectPrompt(condRoot, "classify", { type: "style" }).text).toBe(
      "OTRO",
    );
  });

  it("treats an empty string as falsy in {% if %}", () => {
    const truthRoot = join(tmpRoot, "truthy-project");
    const promptsDir = join(truthRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "flag.prompty"), `---
name: flag
description: Truthiness
inputs:
  - name: extra_context
    kind: string
    description: Extra
    required: false
---

{% if extra_context %}
Y
{% else %}
N
{% endif %}`);

    loadPrompts(truthRoot);
    expect(
      resolveProjectPrompt(truthRoot, "flag", { extra_context: "" }).text,
    ).toBe("N");
    expect(
      resolveProjectPrompt(truthRoot, "flag", { extra_context: "notas" }).text,
    ).toBe("Y");
  });

  it("renders {% for %} loops and {% set %}", () => {
    const loopRoot = join(tmpRoot, "loop-project");
    const promptsDir = join(loopRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "list.prompty"), `---
name: list
description: Loop
inputs:
  - name: items
    kind: string
    description: Items separados por newline
---

Items:
{% for i in items.split("\\n") %}- {{i}}
{% endfor %}
{% set total = "2" %}
Total: {{total}}`);

    loadPrompts(loopRoot);
    const result = resolveProjectPrompt(loopRoot, "list", {
      items: "a\nb",
    });
    expect(result.text).toBe("Items:\n- a\n- b\nTotal: 2");
  });

  it("wraps template syntax errors with file and line number", () => {
    const badRoot = join(tmpRoot, "bad-project");
    const promptsDir = join(badRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "bad.prompty"), `---
name: bad
description: Broken
inputs: []
---

Línea 1
{% if %}`);

    loadPrompts(badRoot);
    expect(() => resolveProjectPrompt(badRoot, "bad", {})).toThrow(
      /Prompt "bad": error de plantilla en línea 2 de .*bad\.prompty: \(unknown path\) \[Line 2, Column \d+\]/,
    );
  });

  it("does not re-parse braces inside substituted values", () => {
    const bracesRoot = join(tmpRoot, "braces-project");
    const promptsDir = join(bracesRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "braces.prompty"), `---
name: braces
description: Braces
inputs:
  - name: v
    kind: string
    description: Valor
---

{{v}}`);

    loadPrompts(bracesRoot);
    const result = resolveProjectPrompt(bracesRoot, "braces", {
      v: "{{nope}} y {% if %}",
    });
    expect(result.text).toBe("{{nope}} y {% if %}");
  });
```

- [ ] **Step 2: Ejecutar los tests para verificar que fallan**

Run: `pnpm --filter coding-agent test:unit resolve-prompt -t "conditionals|falsy|loops|syntax errors|re-parse"`

Expected: FAIL en los 5 tests nuevos. Hoy la implementación no entiende `{% %}`: los deja literales en el output (los 3 primeros aserciones de texto fallan), no lanza error ante sintaxis inválida (falla `toThrow`), y... el de "re-parse braces" PASA ya (es una guarda de regresión, también se queda).

- [ ] **Step 3: Instalar dependencias**

Run:

```bash
pnpm --filter coding-agent add nunjucks@^3.2.4
pnpm --filter coding-agent add -D @types/nunjucks@^3.2.6
```

Expected: `package.json` gana `"nunjucks": "^3.2.4"` en `dependencies` y `"@types/nunjucks": "^3.2.6"` en `devDependencies`; `pnpm-lock.yaml` actualizado.

- [ ] **Step 4: Implementar el swap mínimo**

En `packages/coding-agent/src/prompts.ts`:

a) Añadir el import y el environment singleton tras los imports existentes:

```ts
import nunjucks from "nunjucks";
```

```ts
/**
 * Nunjucks environment for prompt rendering (Jinja2 syntax per the Prompty
 * spec). Options are locked on purpose:
 * - `autoescape: false` — prompt text goes to a chat/textarea; HTML-escaping
 *   would corrupt markdown and code.
 * - `trimBlocks`/`lstripBlocks` — drop newlines and leading whitespace
 *   around block tags (`{% if %}` etc.) so empty blocks leave no stray
 *   blank lines.
 * - Missing variables render as `""` (`throwOnUndefined` default false),
 *   matching the pre-nunjucks behavior.
 * Stateless per render; safe to share across all sessions.
 */
const promptEnv = new nunjucks.Environment(null, {
  autoescape: false,
  trimBlocks: true,
  lstripBlocks: true,
});
```

b) Reemplazar el paso 4 y 5 de `resolveProjectPrompt` (desde el comentario `// 4. Substitute {{var}} placeholders...` hasta el `return { text: body };` inclusive) por:

```ts
  // 4. Render the body with nunjucks (Jinja2). Values are passed as the
  //    template context: they are never re-parsed, so `$` patterns and
  //    literal `{{`/`{%` inside values render as-is. Note: an undeclared
  //    `{{placeholder}}` now renders as "" (throwOnUndefined: false)
  //    instead of staying literal — nunjucks semantics, spec-consistent.
  let text: string;
  try {
    text = renderPromptBody(body, rendered);
  } catch (error) {
    // nunjucks reports syntax errors as a plain Error whose message embeds
    // the position, e.g. "(unknown path) [Line 3, Column 7]" — the sync
    // renderString path does not expose `err.lineno`.
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(/\[Line (\d+), Column (\d+)\]/);
    if (match) {
      throw new Error(
        `Prompt "${promptName}": error de plantilla en línea ${match[1]} de ${prompt.filePath}: ${message}`,
      );
    }
    throw new Error(
      `Prompt "${promptName}": error de plantilla de ${prompt.filePath}: ${message}`,
    );
  }
  return { text };
}
```

c) Añadir el helper `renderPromptBody` justo después de `resolveProjectPrompt` (mueve aquí el post-pass indexado actual intacto; Task 2 lo reescribe):

```ts
/**
 * Render a prompt body against the declared input values.
 *
 * Step 1 — render with nunjucks.
 * Step 2 — drop lines left empty by unfilled optional inputs (spec §4.3
 * step 5): a line that contained a `{{var}}` placeholder and rendered to
 * nothing is removed; lines that were blank in the template itself carry no
 * placeholder, so intentional blank lines are preserved. (Task 2 rewrites
 * this post-pass to also handle `{%...%}` block tags.)
 */
function renderPromptBody(body: string, view: Record<string, string>): string {
  const sourceLines = body.split("\n");
  const lineHasPlaceholder = sourceLines.map((line) =>
    /\{\{[^{}]*\}\}/.test(line),
  );
  body = promptEnv.renderString(body, view);
  return body
    .split("\n")
    .filter((line, index) => !(lineHasPlaceholder[index] && line.trim() === ""))
    .join("\n")
    .trim();
}
```

d) Borrar la ahora-inútil función `escapeRegex(s: string): string { ... }` (si queda, `pnpm --filter coding-agent lint` falla por `no-unused-vars`).

- [ ] **Step 5: Ejecutar los tests para verificar que pasan**

Run: `pnpm --filter coding-agent test:unit resolve-prompt`

Expected: PASS — los 5 tests nuevos + los 5 existentes ("renders a prompt with string values", "throws for missing required input", "throws for unknown prompt", "uses default when value is empty", "removes a line emptied by an unfilled optional input and preserves intentional blank lines", "does not interpret $ patterns inside substituted values").

- [ ] **Step 6: Type check y lint**

Run: `pnpm --filter coding-agent type:check && pnpm --filter coding-agent lint`

Expected: sin errores (el import por defecto de nunjucks tipa contra los named exports de `@types/nunjucks` gracias a `esModuleInterop`; verificado).

- [ ] **Step 7: Suite completa de unit tests del paquete**

Run: `pnpm --filter coding-agent test:unit`

Expected: 12 test files, 115+ tests PASS (incluye `load-prompts` e `integration/session-manager-prompts` no se tocan).

- [ ] **Step 8: Commit**

```bash
git add packages/coding-agent/package.json pnpm-lock.yaml packages/coding-agent/src/prompts.ts packages/coding-agent/tests/unit/resolve-prompt.test.ts
git commit -m "feat(coding-agent): render prompts with nunjucks (Jinja2)" -m "Co-Authored-By: <model name> <noreply@example.com>"
```

---

### Task 2: Post-pass de líneas vacías con sentinelas (artefactos de `{% %}` y de `{{}}`)

**Files:**
- Modify: `packages/coding-agent/src/prompts.ts` (reescribir `renderPromptBody`)
- Test: `packages/coding-agent/tests/unit/resolve-prompt.test.ts`

**Interfaces:**
- Consumes: `promptEnv` y la firma `renderPromptBody(body, view)` de Task 1 — la firma NO cambia, `resolveProjectPrompt` queda intacto.
- Produces: contrato de comportamiento: tras renderizar, una línea vacía es artefacto de tag (se elimina) o blank intencional (se preserva); un run de líneas vacías consecutivas que toca algún tag colapsa a un único blank, y un run compuesto solo de artefactos puros se elimina por completo.

- [ ] **Step 1: Escribir los tests que fallan (desalineación de índice del post-pass actual)**

Añadir al final del describe en `tests/unit/resolve-prompt.test.ts`:

```ts
  it("collapses blank lines around an emptied {% if %} block", () => {
    const ifRoot = join(tmpRoot, "if-empty-project");
    const promptsDir = join(ifRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "section.prompty"), `---
name: section
description: Section
inputs:
  - name: focus_area
    kind: string
    description: Enfoque
    enumValues: [bugs]
  - name: extra_context
    kind: string
    description: Extra
    required: false
---

# Cabecera

{% if focus_area %}
## Enfoque: {{ focus_area }}
{% endif %}

{% if extra_context %}
{{extra_context}}
{% endif %}

## Instrucciones

Analiza y enfócate en {{ focus_area }}.`);

    loadPrompts(ifRoot);
    const result = resolveProjectPrompt(ifRoot, "section", {
      focus_area: "bugs",
      extra_context: "",
    });
    expect(result.text).toBe(
      "# Cabecera\n\n## Enfoque: bugs\n\n## Instrucciones\n\nAnaliza y enfócate en bugs.",
    );

    const filled = resolveProjectPrompt(ifRoot, "section", {
      focus_area: "bugs",
      extra_context: "Presta atención a los tests",
    });
    expect(filled.text).toBe(
      "# Cabecera\n\n## Enfoque: bugs\n\nPresta atención a los tests\n\n## Instrucciones\n\nAnaliza y enfócate en bugs.",
    );

    const none = resolveProjectPrompt(ifRoot, "section", {
      focus_area: "",
      extra_context: "",
    });
    expect(none.text).toBe(
      "# Cabecera\n\n## Instrucciones\n\nAnaliza y enfócate en .",
    );
  });

  it("drops a {% if %}-only block that rendered to nothing", () => {
    const pureRoot = join(tmpRoot, "pure-artifact-project");
    const promptsDir = join(pureRoot, ".agents", "prompts");
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, "pure.prompty"), `---
name: pure
description: Pure artifacts
inputs:
  - name: v
    kind: string
    description: Valor
    required: false
---

A
{% if v %}
{% endif %}
{{v}}
B`);

    loadPrompts(pureRoot);
    expect(resolveProjectPrompt(pureRoot, "pure", { v: "" }).text).toBe(
      "A\nB",
    );
  });
```

- [ ] **Step 2: Ejecutar los tests para verificar que fallan**

Run: `pnpm --filter coding-agent test:unit resolve-prompt -t "collapses blank|drops a"`

Expected: FAIL. El post-pass indexado de Task 1 se desalinea con `trimBlocks` (el render puede tener menos líneas que la plantilla):
- "collapses ...": con `extra_context` vacío produce `## Enfoque: bugs\n## Instrucciones` (pegadas); con `extra_context` lleno produce `## Enfoque: bugs\nPresta atención a los tests\n\n## Instrucciones` (pegado por ambos lados).
- "drops a {% if %}-only block": produce `A\n\nB` (blank de más) en vez de `A\nB`.

- [ ] **Step 3: Implementar el post-pass con sentinelas**

Reemplazar TODO el cuerpo de `renderPromptBody` en `packages/coding-agent/src/prompts.ts` por:

```ts
/**
 * Render a prompt body against the declared input values and drop lines
 * left empty by template constructs (spec §4.3 step 5).
 *
 * Rendering: nunjucks with `trimBlocks`/`lstripBlocks`, so the rendered
 * output can have FEWER lines than the template — block tags and empty
 * `{{var}}` lines collapse. To tell artifact empty lines (a tag that
 * rendered to nothing) apart from intentional blank lines even when several
 * template lines merged into one rendered line, every source line is
 * prefixed with a unique sentinel before rendering; after rendering each
 * output line still carries the indices of the source lines it came from.
 *
 * Empty-line cleanup, per run of consecutive empty output lines:
 * - no tagged source line involved → intentional blanks, keep them all;
 * - only tag-artifact source lines → drop the run entirely;
 * - mixed (an intentional blank merged with collapsed tags) → keep exactly
 *   one blank line.
 */
function renderPromptBody(body: string, view: Record<string, string>): string {
  const token = `\u0001${randomUUID()}\u0001`;
  const sourceLines = body.split("\n");
  const lineHasTag = sourceLines.map((line) =>
    /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/.test(line),
  );
  const sentineledBody = sourceLines
    .map((line, index) => `${token}${index}${token}${line}`)
    .join("\n");

  const rendered = promptEnv.renderString(sentineledBody, view);
  const sentinelRe = new RegExp(`${token}(\\d+)${token}`, "g");
  const parsed = rendered.split("\n").map((line) => {
    const indexes = [...line.matchAll(sentinelRe)].map((m) => Number(m[1]));
    return { indexes, text: line.replace(sentinelRe, "") };
  });

  const kept: string[] = [];
  for (let i = 0; i < parsed.length; ) {
    const item = parsed[i]!;
    if (item.text.trim() !== "") {
      kept.push(item.text);
      i += 1;
      continue;
    }
    // Collect the run of consecutive empty output lines.
    const run: { indexes: number[]; text: string }[] = [];
    while (i < parsed.length && parsed[i]!.text.trim() === "") {
      run.push(parsed[i]!);
      i += 1;
    }
    const touchesTaggedLine = run.some((r) =>
      r.indexes.some((idx) => lineHasTag[idx]),
    );
    if (!touchesTaggedLine) {
      // Purely intentional blank lines: keep them all.
      kept.push(...run.map(() => ""));
    } else {
      const pureArtifact = run.every(
        (r) => r.indexes.length > 0 && r.indexes.every((idx) => lineHasTag[idx]),
      );
      if (!pureArtifact) kept.push("");
      // Pure artifact runs are dropped entirely.
    }
  }
  return kept.join("\n").trim();
}
```

Añadir el import de `randomUUID` junto a los otros imports de `node:`:

```ts
import { randomUUID } from "node:crypto";
```

Nota: el token aleatorio (`\u0001` + UUID + `\u0001`) evita colisiones con valores del usuario; los caracteres de control nunca llegan al output porque se eliminan con el mismo regex.

- [ ] **Step 4: Ejecutar los tests para verificar que pasan**

Run: `pnpm --filter coding-agent test:unit resolve-prompt`

Expected: PASS — los 2 tests nuevos + todos los de Task 1 + los 5 originales. (`randomUUID` ya se usa en los tests; queda disponible en Node 24.)

- [ ] **Step 5: Suite completa + type check + lint**

Run: `pnpm --filter coding-agent test:unit && pnpm --filter coding-agent type:check && pnpm --filter coding-agent lint`

Expected: 12 test files PASS; sin errores de tsc ni eslint.

- [ ] **Step 6: Commit**

```bash
git add packages/coding-agent/src/prompts.ts packages/coding-agent/tests/unit/resolve-prompt.test.ts
git commit -m "fix(coding-agent): drop blank lines left by empty prompt tags" -m "Co-Authored-By: <model name> <noreply@example.com>"
```

---

### Task 3: Demo en el builtin `code-review-session`

**Files:**
- Modify: `packages/coding-agent/prompts/code-review-session.prompty`
- Test: `packages/coding-agent/tests/unit/resolve-prompt.test.ts`

**Interfaces:**
- Consumes: `resolveProjectPrompt` con el renderer de Tasks 1-2; el catálogo builtin se carga desde `PACKAGE_ROOT/prompts` como nivel de prioridad más bajo (los proyectos de test no definen `code-review-session`, así que el builtin gana).
- Produces: `code-review-session.prompty` documenta la nueva capacidad: `{% if %}` alrededor del bloque `## Enfoque` y de `{{extra_context}}`. Comportamiento: con `focus_area` vacío el bloque entero desaparece (no queda `## Enfoque:` colgando); con `extra_context` vacío no queda línea en blanco de más.

- [ ] **Step 1: Escribir el test que falla (el builtin actual no usa condicionales)**

Añadir al final del describe en `tests/unit/resolve-prompt.test.ts`:

```ts
  it("renders the builtin code-review-session prompt with conditionals", () => {
    const builtinRoot = join(tmpRoot, "builtin-project");
    mkdirSync(builtinRoot, { recursive: true });
    loadPrompts(builtinRoot);

    const full = resolveProjectPrompt(builtinRoot, "code-review-session", {
      target_session: "s-123",
      focus_area: "bugs",
      extra_context: "Presta atención a los tests",
    });
    expect(full.text).toBe(
      "# Code Review de la sesión [s-123](session:s-123)\n\n" +
        "## Enfoque: bugs\n\n" +
        "Presta atención a los tests\n\n" +
        "## Instrucciones\n\n" +
        "Analiza los cambios de la sesión, enfócate en **bugs** y reporta:\n" +
        "1. Problemas encontrados\n" +
        "2. Sugerencias de mejora\n" +
        "3. Riesgos y trade-offs",
    );

    const noExtra = resolveProjectPrompt(builtinRoot, "code-review-session", {
      target_session: "s-123",
      focus_area: "bugs",
      extra_context: "",
    });
    expect(noExtra.text).toBe(
      "# Code Review de la sesión [s-123](session:s-123)\n\n" +
        "## Enfoque: bugs\n\n" +
        "## Instrucciones\n\n" +
        "Analiza los cambios de la sesión, enfócate en **bugs** y reporta:\n" +
        "1. Problemas encontrados\n" +
        "2. Sugerencias de mejora\n" +
        "3. Riesgos y trade-offs",
    );

    const enumOmitted = resolveProjectPrompt(builtinRoot, "code-review-session", {
      target_session: "s-123",
      focus_area: "",
      extra_context: "",
    });
    expect(enumOmitted.text).toBe(
      "# Code Review de la sesión [s-123](session:s-123)\n\n" +
        "## Instrucciones\n\n" +
        "Analiza los cambios de la sesión, enfócate en **** y reporta:\n" +
        "1. Problemas encontrados\n" +
        "2. Sugerencias de mejora\n" +
        "3. Riesgos y trade-offs",
    );
  });
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `pnpm --filter coding-agent test:unit resolve-prompt -t "builtin code-review-session"`

Expected: FAIL con el builtin actual (los `{% if %}` aparecen literales o rompen el output).

- [ ] **Step 3: Actualizar el builtin**

Reemplazar el cuerpo de `packages/coding-agent/prompts/code-review-session.prompty` por:

```prompty
# Code Review de la sesión {{target_session}}

{% if focus_area %}
## Enfoque: {{ focus_area }}
{% endif %}

{% if extra_context %}
{{extra_context}}
{% endif %}

## Instrucciones

Analiza los cambios de la sesión, enfócate en **{{focus_area}}** y reporta:
1. Problemas encontrados
2. Sugerencias de mejora
3. Riesgos y trade-offs
```

(Solo cambia el body; frontmatter intacto.)

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `pnpm --filter coding-agent test:unit resolve-prompt -t "builtin code-review-session"`

Expected: PASS.

- [ ] **Step 5: Suite completa + type check + lint**

Run: `pnpm --filter coding-agent test:unit && pnpm --filter coding-agent type:check && pnpm --filter coding-agent lint`

Expected: todo PASS (la suite de integration `session-manager-prompts` también, sin cambios).

- [ ] **Step 6: Commit**

```bash
git add packages/coding-agent/prompts/code-review-session.prompty packages/coding-agent/tests/unit/resolve-prompt.test.ts
git commit -m "docs(coding-agent): demo {% if %} conditionals in code-review-session prompt" -m "Co-Authored-By: <model name> <noreply@example.com>"
```

---

## Self-Review

**1. Cobertura del spec (design doc):**
- Motor nunjucks `^3.2.4` + `@types` → Task 1 ✓
- Env singleton con `autoescape: false`, `trimBlocks`, `lstripBlocks` → Task 1 ✓
- Firma pública y pipeline sin cambios estructurales → Task 1 (pasos 1-3 intactos) ✓
- Errores con mensaje accionable y línea/nº de línea → Task 1 (con la desviación verificada: línea parseada del mensaje, no de `lineno`) ✓
- Post-pass de líneas vacías extendido a `{%...%}` → Task 2 (con la desviación verificada: sentinelas, no índices) ✓
- `$` patterns y valores con llaves literales → Task 1 (tests de regresión) ✓
- Truthiness (`{% if extra_context %}` con `""`) → Task 1 ✓
- Restricción de nombres `snake_case` documentada → Global Constraints + comentario en Task 1 ✓
- Demo en builtin → Task 3 ✓
- Testing listado en el design (condicional con enumValues, if/elif/else, if con var vacía, error de sintaxis con línea, llaves literales, `$`) → Tasks 1-3 ✓

**2. Placeholder scan:** sin TBD/TODO; cada paso lleva código, comandos y output esperado exactos (todos los outputs del plan fueron verificados ejecutando un prototipo real de la implementación, incluyendo los outputs "Expected: FAIL" de Tasks 2-3).

**3. Consistencia de tipos:** `renderPromptBody(body: string, view: Record<string, string>): string` se define en Task 1 y se consume en Tasks 1-3 con la misma firma; `resolveProjectPrompt` no cambia; `randomUUID` se importa en Task 2, usado solo ahí; `escapeRegex` se elimina en Task 1 y no se referencia en ninguna otra tarea.