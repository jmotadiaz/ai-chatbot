# Diseño: soporte de imágenes (`img`) para Muse Spark 1.2 y OX Alpha (free)

Fecha: 2026-08-25

## Objetivo

Habilitar adjuntos de imagen (`img`) en los modelos **Muse Spark 1.2** y
**OX Alpha (free)**, ambos ya presentes en el catálogo único
`packages/models/src/catalog.ts`.

## Cambio

Añadir `supportedFiles: ["img"]` a las entradas:

1. `Muse Spark 1.2` (provider `opencodeGoResponses`, id `muse-spark-1.2-contributor`)
2. `OX Alpha (free)` (provider `opencodeGo`, id `ox-alpha-free`)

Ningún otro campo cambia. No se toca `model-registry` ni código de consumo:
el campo se propaga solo por diseño del monorepo.

## Propagación automática (sin código nuevo)

- **Chatbot**: `languageModelConfigurations`
  (`packages/chatbot/lib/features/foundation-model/config.ts`) copia
  `supportedFiles` a la configuración → el control de adjuntos
  (`attachments/control.tsx`) muestra el botón de imagen y
  `lib/features/attachment/utils.ts` deja de rechazar `image/*`; el model
  picker muestra la insignia "img".
- **Coding-agent**: `generateModelsJson`
  (`packages/models/src/generate-models-json.ts`) deriva
  `input: ["text", "image"]` en el `models.json` generado para Pi → las
  sesiones de coding agent pueden recibir imágenes con estos modelos.

## Tests a actualizar

1. `packages/models/src/generate-models-json.test.ts` — "describes the Muse
   Spark model fully": `input: ["text"]` → `["text", "image"]`. Además se
   añade una aserción equivalente para `OX Alpha (free)` (hoy sin cobertura
   de `input`).
2. `packages/chatbot/tests/unit/foundation-model/muse-spark-config.test.ts` —
   `expect(cfg.supportedFiles).toBeUndefined()` →
   `expect(cfg.supportedFiles).toEqual(["img"])`.

Los tests de mapping y de session-manager usan estos modelos como fixtures
pero no afirman nada sobre archivos soportados: sin cambios.

## Verificación

- `pnpm --filter @earendil-works/models test` (unit)
- `pnpm --filter chatbot exec vitest run tests/unit/foundation-model/muse-spark-config.test.ts`
- `pnpm lint:fix` + type-check de los paquetes tocados.
