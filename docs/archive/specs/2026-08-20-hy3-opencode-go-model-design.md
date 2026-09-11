# Diseño: Hy3 (OpenCode Go) y Empresa Tencent como modelo userInvocable

## Contexto y Objetivo

Añadir el modelo **Hy3** de Tencent (`company: "tencent"`) como modelo `userInvocable: true` servido a través del provider **OpenCode Go** (`provider: { kind: "opencodeGo", modelId: "hy3" }`).

Al ser `userInvocable: true`, el modelo estará disponible tanto en el selector de modelos del chat como en el coding agent.

## Especificaciones del Modelo

Basado en la ficha técnica oficial de Tencent Hunyuan y el registro de OpenCode Go (`https://opencode.ai/zen/go/v1/models`):
- **Display ID / Name:** `"Hy3"`
- **Provider Kind:** `"opencodeGo"`
- **Provider Model ID:** `"hy3"`
- **Company:** `"tencent"` (nueva empresa registrada en el catálogo y UI)
- **Reasoning:** `true`
- **Context Window:** `262_144` tokens (256K)
- **Max Output Tokens:** `128_000` tokens (~128K)
- **Costos (por millón de tokens):**
  - Input: `$0.14` (`0.14`)
  - Output: `$0.58` (`0.58`)
  - Cache Read: `$0.038` (`0.038`)
  - Cache Write: `$0` (`0`)
- **Reasoning / Thinking:**
  - `defaultThinkingLevel`: `"high"`
  - `thinkingLevelMap`:
    ```ts
    {
      off: "no_think",
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
    }
    ```

## Icono de Empresa: Tencent

- Origen: LobeHub Icons (`https://lobehub.com/icons/tencent`).
- Componente: `TencentIcon` en `packages/chatbot/components/ui/icons.tsx`.
- SVG:
  ```tsx
  export const TencentIcon = ({ size = 16 }: { size?: number }) => (
    <svg
      fill="currentColor"
      fillRule="evenodd"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Tencent</title>
      <path d="M9.976 1L24 9.8l-10.587.015L10.723 23H5.489L8.18 9.8H3.244L1 5.4h8.077L9.976 1z"></path>
    </svg>
  );
  ```
- Integración en `packages/chatbot/components/chat/model-picker.tsx` en el mapa `icons`.

## Arquitectura y Componentes Afectados

1. **`packages/models/src/catalog.ts` y `packages/model-registry/src/types.ts`**
   - Añadir `"tencent"` al tipo `Company`.
   - Registrar la entrada `"Hy3"` en `MODEL_CATALOG` dentro del bloque `userInvocable: true`.

2. **`packages/models/src/mapping.ts`**
   - `toPiModelId("Hy3")` resuelve a `{ providerId: "opencode-go", modelId: "hy3" }`.
   - `toChatModelId("opencode-go", "hy3")` resuelve a `"Hy3"`.

3. **`packages/models/src/generate-models-json.ts`**
   - Al ser un modelo `opencodeGo` que Pi no incluye de serie, genera automáticamente su definición en `providers["opencode-go"].models` utilizando los límites, costes y `thinkingLevelMap` declarados.

4. **`packages/chatbot/lib/infrastructure/ai/providers.ts`**
   - Ya soporta `opencodeGo: (modelId: string) => getOpenCodeGo()(modelId)`.

5. **`packages/chatbot/components/ui/icons.tsx` y `packages/chatbot/components/chat/model-picker.tsx`**
   - Añadir `TencentIcon` y registrar `tencent: TencentIcon`.

6. **Tests de Validación:**
   - `packages/models/src/catalog.test.ts`: Actualizar `INVOCABLE_MODEL_IDS`, validar thinking levels soportados (`["off", "low", "high"]`) y resolver default thinking level.
   - `packages/models/src/mapping.test.ts`: Verificar mapeo bidireccional `toPiModelId` / `toChatModelId` para `Hy3`.
   - `packages/models/src/generate-models-json.test.ts`: Verificar que `generateModelsJson` describe `Hy3` completamente bajo `opencode-go`.
   - `packages/chatbot/tests/unit/foundation-model/hy3-config.test.ts`: Verificar configuración en chatbot (`company: "tencent"`).

## Plan de Verificación

1. `pnpm --filter models test:unit`
2. `pnpm --filter chatbot test:unit`
3. `pnpm verify:fast`
