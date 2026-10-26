# 01: Registry in-memory de streams reanudables

**What to build:** Ver `../spec.md` (decisión 1). Módulo nuevo en
`packages/chatbot` con el registry process-wide que alimenta y sirve los
streams reanudables del chat.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Módulo nuevo (p. ej. `lib/features/chat/resume/registry.ts`): `Map`
  claveado por `streamKey` (uuid por turno) + índice "última stream por
  `chatId`". API mínima: `register(key, { chatId? })`, `append(key, sseChunk)`,
  `markPersisted(key)`, `get(key)`, `getLatestByChat(chatId)`, `evict`.
  Sin `globalThis`; module-level singleton como los existentes
  (`lib/infrastructure/ai/catalog.ts` como precedente).
- [ ] Buffer: chunks SSE ya codificados (`data: {...}\n\n`), concatenados en
  orden; el chunk `start` con el `messageId` original queda primero (requisito
  de idempotencia del replay).
- [ ] Estados: `streaming` → `persisted` (confirmado por el `onFinish` de la
  factoría); el buffer sigue servible tras terminal hasta el TTL.
- [ ] Evict por TTL (~60 min tras `persisted`; valor como constante del
  módulo). Sin persistencia en disco: un reinicio del proceso pierde el
  buffer por diseño (spec, "Fuera de alcance").
- [ ] Tests (TDD, unit): append en orden y replay desde el primer chunk;
  `markPersisted` no evict; evict por TTL; índice por `chatId` apunta a la
  última stream; concurrencia de varias streams del mismo chat no se pisan
  (clave por `streamKey`, no por `chatId`).
- [ ] Verificación: `pnpm --filter chatbot type:check`, lint,
  `pnpm test:unit` y `pnpm --filter chatbot build:verify`. Nunca `build`.

## Comments
