# 10: Hardening del parseo en /rpc

**What to build:** Ninguna petición al endpoint `/rpc` del worker puede tumbar
el proceso por un body malformado. Hoy `handleRpc` (`src/transports/http.ts`)
hace `JSON.parse(requestBody)` fuera de try/catch y destructura sin validar:
cualquier POST con body inválido (p. ej. vacío) lanza un unhandledRejection y
mata el worker — y con él, al ser la app pm2 `pnpm preview` un único proceso,
el servicio completo. 3015 escucha en `*` (expuesto a la LAN), así que esto es
DoS trivial sin autenticación.

**Origen:** incidente 2026-09-02 (2) durante la verificación del ticket 06 — el
agente envió `curl -X POST :3015/rpc` sin body como «check de lectura»; el
worker cayó y el operador tuvo que reiniciar a mano. Ver map.md.

**Type:** task
**Blocked by:** none

**Status:** resolved

- [x] `handleRpc` responde JSON-RPC error (-32700 Parse error) con body no
      parseable, `null`, no-objeto o `method` ausente — sin lanzar fuera
- [x] Unit tests en `tests/contract/http-transport-connect.test.ts` (o nuevo
      fichero co-located) cubriendo: `""`, `"no-json"`, `"null"`, `'{"id":1}'`
      (sin method) → Responses de error, proceso vivo
- [x] El fix vive en código; entra en prod en el próximo arranque legítimo
      (prohibido reiniciar prod para desplegarlo sin aprobación del operador)

## Answer

Fix mínimo en `handleRpc` (`src/transports/http.ts`): `JSON.parse` dentro de
try/catch + validación de objeto no-nulo ANTES de destructurar → `-32700`
(`Parse error…`) con Response 200, nunca throw por el body. El resto ya era
seguro: el `try` interno cubre throws de los handlers (`-32603`) y el
`default` del switch devuelve `-32601` para `method` ausente/desconocido.

Tests: `packages/coding-agent/tests/contract/http-transport-parse.test.ts`
(4 casos; rojo confirmó los 3 modos de crash — SyntaxError ×2, TypeError por
destructurar `null` — y fijó la regresión de -32601). Suite worker completa:
268 tests / 32 ficheros ✓, `tsc --noEmit` ✓, lint ✓.

Zona sin blindar, registrada para futuro hardening (fuera de alcance aquí):
`handleHttpRequest` tiene `readRequestBody`/`acquireTraceSink` fuera de su
`try` — un abort de red a mitad de body o un fallo del sink seguirían
produciendo unhandledRejection. El vector real observado (body malformado)
queda cerrado por este fix; entraría en prod en el próximo arranque legítimo
de `preview` — sin restart dedicado.
