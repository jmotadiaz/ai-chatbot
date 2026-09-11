# Prompts en archivos planos (`prompts/<name>.prompty`) — Diseño

**Fecha:** 2026-08-06
**Estado:** Propuesta (pendiente de revisión)
**Amenda a:** [`2026-08-03-reusable-prompts-design.md`](./2026-08-03-reusable-prompts-design.md) — sustituye el layout de archivos descrito en D4/§4.1 y descarta el `kind: path` (§4.1.1, §4.3, §4.2)
**Contexto:** El sistema de prompts reutilizables adoptó `prompts/<name>/prompt.prompty` (un directorio por prompt, espejando `skills/<name>/SKILL.md`). Ese directorio intermedio no aporta valor: el formato Prompty define un `.prompty` como un único archivo markdown con frontmatter YAML ("one file, everything declared"). Con archivos planos el sistema es Prompty-compliant y el nombre del archivo coincide con el `name` del prompt. Además, `kind: path` no funciona bien hoy y se descarta de este desarrollo para repensarlo después.

## 1. Problema

1. El layout `prompts/<name>/prompt.prompty` emula a las skills pero no se corresponde con el estándar [Prompty](https://prompty.ai/), que define el `.prompty` como un archivo plano único. El directorio intermedio no aporta nada: no contiene assets adicionales ni metadatos de nivel.
2. Hay una inconsistencia latente: el directorio `packages/coding-agent/prompts/code-review/` contiene un prompt cuyo frontmatter `name` es `code-review-session`. Con planos el filename ES el nombre del prompt, eliminando la duplicidad.
3. `kind: path` (inputs de tipo ruta con `render: reference | contents | path` y `basePath`) no funciona bien: la resolución `join(baseDir, basePath, value)` contra el directorio del prompt no coincide con el comportamiento descrito en el spec 2026-08-03 (§4.1.1 dice "relativo al project root"). Se descarta y se repensará de cero.

## 2. Decisiones tomadas (con el usuario)

| # | Decisión | Elección |
|---|----------|----------|
| D1 | Layout de archivos | **Archivos planos** `prompts/<name>.prompty` en los 3 niveles (built-in, paquete Pi, proyecto). Corte limpio: no hay soporte dual de directorios, no hay migración de usuarios (solo existen 2 prompts, sistema pre-v1). |
| D2 | Descarte de `kind: path` | **Eliminación completa** del código: interface, `normalizeInputs`, `renderInputValue`, propiedades `basePath`/`baseDir`, y el input `file_to_read` del prompt de prueba. Se repensará aparte en el futuro. |
| D3 | Nombre del archivo | El filename (sin `.prompty`) coincide con el `name` del prompt. `name` se sigue derivando de `fm.name` ?? filename sin extensión. |
| D4 | Docs históricos | Spec/plan del 2026-08-03 y spec/plan del 2026-08-06 quedan como documentos históricos. Este spec los amenda explícitamente. |

## 3. Layout de archivos

```
prompts/<name>.prompty   # en cada uno de los 3 niveles:
```

| Nivel | Ubicación | Prioridad |
|-------|-----------|-----------|
| Built-in | `packages/coding-agent/prompts/<name>.prompty` | Baja |
| Global (Pi packages) | `.pi/packages/<pkg>/prompts/<name>.prompty` | Media |
| Proyecto | `<projectRoot>/.agents/prompts/<name>.prompty` | Alta (gana) |

Shadowing, descubrimiento bajo demanda y catálogo inmutable por proyecto: sin cambios respecto al spec 2026-08-03 (§4.2).

### Migración de archivos existentes

| Antes | Después |
|-------|---------|
| `packages/coding-agent/prompts/code-review/prompt.prompty` | `packages/coding-agent/prompts/code-review-session.prompty` (filename = `name` del frontmatter) |
| `.agents/prompts/test-all-kinds/prompt.prompty` | `.agents/prompts/test-all-kinds.prompty` (se elimina el input `file_to_read`, kind path) |

## 4. Cambios en `packages/coding-agent/src/prompts.ts`

### 4.1 Scanner — `scanPromptDir`

- En lugar de iterar directorios y buscar `prompt.prompty` dentro, iterar los archivos directos del nivel y filtrar por extensión `.prompty`.
- Ignorar: directorios, archivos sin extensión `.prompty`, frontmatter inválido (warning, como hoy).
- `filePath` = el archivo plano. `baseDir` se **elimina** de `CodingAgentPrompt` (su único uso era la resolución de `kind: path`).

### 4.2 Eliminación de `kind: path`

- `PromptInput`: se elimina `basePath`.
- `CodingAgentPrompt`: se elimina `baseDir`.
- `renderInputValue`: se elimina el `case "path"`.
- Comentarios de la interface actualizados (kinds: `string | session | prompt`).

### 4.3 Sin cambios

- `loadPrompts` (3 niveles + shadowing + catálogo por proyecto), `getProjectPrompts`, `resolveProjectPrompt` (validación, sustitución `{{var}}`, borrado de líneas vacías), render de `session` y `prompt`, RPCs, frontend (el modal no tiene caso específico de `kind: path`; cae al input genérico).

## 5. Cambios en `packages/chatbot`

- `worker-client.ts`: eliminar `basePath` de la interface `PromptInput`.
- Nada más: `prompt-form-modal.tsx` no distingue `kind: path` (cae al input genérico), no hay componentes path-specific de prompts.

## 6. Testing

- **`load-prompts.test.ts`** (coding-agent): paths a flat; el test "skips directories without prompt.prompty" se sustituye por "ignora archivos no `.prompty`" (p. ej. un `README.md` o un directorio anidado); el resto de assertions se mantienen.
- **`resolve-prompt.test.ts`** (coding-agent): crear prompts como `writeFileSync(join(promptsDir, "<name>.prompty"), ...)` sin `mkdirSync` por prompt. No hay tests de `kind: path` que eliminar (solo cubre `kind: string`).
- **`session-manager-prompts.test.ts`** (chatbot): el helper escribe `<name>.prompty` plano.
- El built-in `code-review-session` se mantiene; los tests de isolation/catalog que lo referencian siguen pasando.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Alguien crea un prompt con directorio (estructura antigua) y no se descubre | Warning en el scanner si se encuentra un directorio que contenga `prompt.prompty` (estructura legacy), indicando el formato nuevo. |
| Un `.prompty` sin frontmatter `name` | Se usa el filename sin extensión (comportamiento actual con el nombre del directorio). |
| Docs históricos desactualizados respecto al layout | Este spec amenda explícitamente los specs 2026-08-03 y 2026-08-06; los planes históricos ya se ejecutaron. |

## 8. Fuera de scope (futuro)

- **Repensar `kind: path`** desde cero: base de resolución (¿project root?), file picker en el frontend, `render: contents` con límites de tamaño.
- **Prompty folders** si en el futuro se necesitan assets adicionales por prompt (el estándar los define como `<name>.prompty/<name>.prompty`, no como `prompt.prompty`).
