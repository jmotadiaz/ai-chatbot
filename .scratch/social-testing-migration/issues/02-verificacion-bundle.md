# 02: Hacer fiable la inspección del bundle

**What to build:** Permitir que el operador distinga una inspección real del
bundle de cliente de una comprobación no realizada, y garantizar que la
verificación completa inspecciona el resultado recién generado de forma
aislada.

**Blocked by:** Ninguno (puede comenzar inmediatamente).

**Status:** ready-for-agent

- [x] La verificación rápida informa explícitamente cuando el bundle no está disponible y no presenta una inspección omitida como inspección satisfactoria.
- [x] La verificación completa ejecuta primero el build de verificación aislado y exige después una inspección satisfactoria de su resultado reciente.
- [x] Un build o inspección fallidos, un artefacto ausente tras el build o la inspección exclusiva de un artefacto desactualizado hacen fallar la verificación completa.
- [x] Los tests demuestran los casos de artefacto ausente, desactualizado y reciente, incluida la ejecución efectiva de la inspección y la propagación de errores.
- [x] Las instrucciones afectadas describen el comportamiento real; no se ejecuta un build de Production ni se modifican sus artefactos.

## Implementación

- `packages/chatbot/scripts/client-bundle.ts`: inspección pura (`inspectClientBundle`: `missing`, `stale`, `leaks`, `inspected`) y orquestación (`verifyClientBundle`, con el build inyectado).
- `packages/chatbot/scripts/verify-client-bundle.ts`: CLI `--mode=fast|full`; solo lanza `pnpm build:verify` (aislado).
- Scripts: `chatbot inspect:bundle` (rápida, encadenada en `verify:fast`) y `chatbot verify:bundle` (completa, encadenada al final de `verify:full` tras `coding-agent build:verify`). `verify:full` ya no ejecuta el build de verificación antes de inspeccionar por separado.
- `tests/contract/client-bundle-no-secrets.test.ts` usa la misma inspección y se marca como `skipped` (no `passed`) cuando no existe `.next/verify`.
- Frescura: cada `.js` de `.next/verify/static` debe tener `mtime >= inicio del build` (verificado empíricamente: un segundo build reescribe los 447 chunks).

## Evidencia

Entorno: Node 24.15.0 (`~/.nvm/versions/node/v24.15.0`), pnpm 11.5.0, worktree `agent/social-testing-02`.

- `tests/unit/scripts/client-bundle.test.ts`: 18 pasan. Cubren artefacto ausente (fast y full), desactualizado (full lo rechaza; fast lo inspecciona sin afirmar frescura), reciente y limpio, fuga en chunk reciente, build fallido (no se inspecciona aunque haya un artefacto limpio), build sin artefacto y error del build propagado.
- Contract `client-bundle-no-secrets`: sin `.next/verify` → `1 skipped`; con artefacto → `inspected`.
- `pnpm --filter chatbot inspect:bundle` sin artefacto → `NOT INSPECTED`, exit 0.
- `pnpm --filter chatbot verify:bundle` real → `build:verify` OK y `OK: 447 chunk(s) inspected against 6 literal(s); all chunks newer than the build start`, exit 0.
- `pnpm --filter coding-agent build:verify` → exit 0.
- `pnpm --filter chatbot test:contract` → 50 pasan, 1 skipped (sin artefacto); `eslint` y `tsc --noEmit` del chatbot limpios.

## Limitaciones

- En verificación rápida, un artefacto ausente no es fallo sino `NOT INSPECTED` con exit 0; `verify:full` es quien lo exige.
- En verificación rápida, un artefacto existente se inspecciona sin comprobar frescura.
- Los casos de build fallido, artefacto desactualizado y fuga en la verificación completa se demuestran con un build inyectado en tests unitarios; no se provocó un fallo real de `build:verify` ni se ejecutó `verify:full` completo (incluye E2E y suites de infraestructura).
- La lista de literales sigue leyendo `secrets.prod.ts` (gitignored); sin ese archivo solo se comprueban los literales fijos.
- En este worktree se copiaron localmente `secrets.prod.ts` y `secrets.dev.ts` desde el repositorio principal (gitignored, no versionados) para poder compilar.
