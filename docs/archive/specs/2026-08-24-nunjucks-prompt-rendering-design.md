# Nunjucks (Jinja2) como motor de render de prompts — Design

> Fecha: 2026-08-24. Estado: borrador sin commitear.

## Contexto

La implementación actual de render de prompts ([`packages/coding-agent/src/prompts.ts`](../../../packages/coding-agent/src/prompts.ts)) sustituye `{{var}}` con regex (`String.prototype.replace` con función de reemplazo) y luego elimina líneas que contenían un placeholder y quedaron vacías. Esto impide condicionales en el body: no hay forma de expresar `{% if type == "bug" %}`.

El spec oficial de Prompty usa **Jinja2** como motor de plantillas. Decidido con el usuario: adoptar **nunjucks** (implementación JS madura de Jinja2, sync, mantenida por Mozilla) como motor real. La sintaxis de variables `{{var}}` es idéntica, así que las plantillas `.prompty` existentes siguen funcionando sin cambios.

## Decisión

| Aspecto | Decisión |
|---|---|
| Motor | `nunjucks@^3.2.4` (dependencia directa del paquete `coding-agent`) |
| Tipos | `@types/nunjucks` (devDependency) |
| Sintaxis | Jinja2: `{{ var }}`, `{% if %}`, `{% elif %}`, `{% else %}`, `{% for %}`, `{% set %}`, filtros estándar |
| Escaping HTML | `autoescape: false` — el texto va a un textarea/chat, el escaping corrompería markdown y código |
| Whitespace | `trimBlocks: true` + `lstripBlocks: true` — elimina newlines/espacios alrededor de tags de bloque |
| Variables ausentes | `throwOnUndefined: false` (default) — renderizan `""`, igual que hoy |

## Arquitectura

Sin cambios estructurales: mismo catálogo, mismo `resolveProjectPrompt(projectCwd, promptName, values)` → `{ text }`. Solo cambia el paso 4 (sustitución) y se ajusta el paso 5 (líneas vacías).

### Pipeline de render (`resolveProjectPrompt`)

1. **Validación** — sin cambios: inputs `required: true` sin valor → error enumerando faltantes.
2. **Lectura del body** — sin cambios.
3. **Valores renderizados** — sin cambios: `renderInputValue(input, value)` produce el texto por input (links `session:`/`prompt:`, etc.).
4. **Render con nunjucks** — `env.renderString(body, view)` donde `view` es `Record<string, string>` con **solo los inputs declarados** en el frontmatter (los valores pasados pero no declarados se ignoran, como hoy).
5. **Post-pass de líneas vacías** — se conserva el comportamiento actual, extendiendo la detección a líneas con tags `{%...%}`:
   - Se calcula por línea de la plantilla si contiene un tag (`{{...}}` o `{%...%}`).
   - Tras renderizar, las líneas que tenían tag y quedaron vacías se eliminan.
   - Las líneas en blanco intencionales (sin tag) se preservan.

### Environment (singleton a nivel de módulo)

```ts
import nunjucks from "nunjucks";

const env = new nunjucks.Environment(null, {
  autoescape: false,
  trimBlocks: true,
  lstripBlocks: true,
});
```

- Sin loaders: solo `renderString`.
- El environment es stateless por sesión; se crea una vez al cargar el módulo.

### Comportamientos garantizados

- **Valores no reinterpretados**: si un valor contiene `{{` o `{%`, se renderiza literal (nunjucks no re-parsea la salida).
- **Sin riesgo de patrones `$`**: desaparece el `String.prototype.replace` con regex; los valores se pasan por el view.
- **Truthiness estándar de Jinja2**: `{% if extra_context %}` es falso si el valor es `""`; `{% if type == "bug" %}` compara contra el valor del enum.
- **Restricción de nombres**: un input llamado `foo-bar` se interpretaría como resta en nunjucks. Los nombres existentes usan `snake_case`; se documenta la convención, sin validación extra.

### Errores

nunjucks lanza `TemplateError` con `lineno` ante sintaxis inválida (p. ej. `{% if %}` sin cerrar). Se captura y relanza como error con mensaje accionable:

```
Prompt "code-review-session": error de plantilla en línea 7 de <filePath>: <mensaje original>
```

### Dependencias

- `dependencies`: `nunjucks@^3.2.4` (CJS; `import nunjucks from "nunjucks"` con `esModuleInterop: true` ya configurado).
- `devDependencies`: `@types/nunjucks`.

## Demo en builtin

Actualizar `packages/coding-agent/prompts/code-review-session.prompty` para mostrar la nueva capacidad, p. ej. envolver `{{extra_context}}` y el bloque de enfoque en `{% if %}` — sirve de ejemplo documentado y de prueba manual de la feature.

## Testing

**Unit (`tests/unit/resolve-prompt.test.ts`)** — casos nuevos:
- Condicional `{% if focus_area == "bug" %}` con `enumValues` → renderiza cuando coincide, omite cuando no.
- `{% if %}` / `{% elif %}` / `{% else %}`.
- Bloque `{% if %}` con variable vacía → no deja líneas en blanco.
- Error de sintaxis → mensaje claro con número de línea.
- Valor con `{{`/`{%` literales → se renderiza literal.
- `$` patterns → sigue pasando (test existente, sin cambios).

**Unit/integration existentes** — deben pasar sin cambios:
- Render básico, defaults, líneas vacías de opcionales + blank lines intencionales.
- Aislamiento por proyecto y reconnect (`tests/integration/session-manager-prompts.test.ts`).

## Fuera de alcance

- `kind: path` y `render: summary`/`body` reales (stubs existentes — siguen igual).
- Filtros personalizados de nunjucks.
- Sandboxing: los templates vienen de directorios con el mismo nivel de confianza que las skills.
- Migrar a `jinja2-wasm` (async, mayor fidelidad) — decisión aplazada indefinidamente.
