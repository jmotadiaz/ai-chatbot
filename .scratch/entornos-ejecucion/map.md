# Map: entornos-ejecucion

Espec: [spec.md](spec.md) · Tickets: `issues/01-…` a `issues/09-…`

## Notes (state)

- DAG de bloqueos: 01 → {02,04} → 03 → …; frontier por número. Avance actual: 01, 02, 03 resueltos.
- Transición pm2: tras el incidente, la vía canónica de prod es **1 app `pm2 → pnpm preview`** con `.env.prod` embebido (el recovery la restableció; `ai-chatbot` online y respondiendo 8085+3015). `ecosystem.config.js` = plan B no canónico. Pendiente: `pm2 save` (Stage 2).
- La DB dev actual (`5433/main`, contenedor `ai-chatbot-db`) queda huérfana al eliminar el compose compartido (02); el dato queda en `./postgres-data` (bind mount) sin migrar (out of scope).

## Decisions so far

- 01 (resuelto): `.env.dev`/`.env.prod` gitignored (secrets reales copiados de `.env.development.local`, URLs/puertos/dirs por Entorno: dev 5433/dev+3000+3016, prod 5435/prod+8085+3015); `.env.test` versionado con secrets fake + punteros `.pi-test/*`. `.env.development.local` y el alias `packages/chatbot/.env.test|.env.development.local` eliminados. `resolveEnvFile()` devuelve **ruta absoluta anclada a la raíz del repo** (consumidores: migrate, seed, drizzle.config, playwright, eval-runner) mapeando `test|evals|dev|prod` → `.env.*`, default `.env.dev`, nunca `.env.development.local`. `.gitignore` añade `.env.dev`, `.env.prod`, `/.pi-{dev,test,prod}`, `/packages/coding-agent/.pi*`, `/packages/coding-agent/dist*`.
- 02 (resuelto): tres compose files → ver `issues/02-…` Answer.
- 03 (resuelto): scripts `db:<env>:*` + seeds → ver `issues/03-…` Answer. Dos desviaciones del catálogo del spec: `dotenv -o` (override) en migrate/seed porque el shell hereda `POSTGRES_URL` (user story 7) y `dotenv -e` sin `-o` no sobrescribe; y `--chats=N` en vez de `--chats N` porque el parser de `seed-test-data.ts` solo acepta la forma con `=`.
- ADRs enmendados (2026-09-02): **ADR 0002 v2** — prod conserva TODAS sus configuraciones de runtime vigentes y funcionando; dev/test adoptan valores aislados `.pi-dev/*`/`.pi-test/*`; sin migración de estado de prod. **ADR 0003 v2** — vía canónica de prod = 1 app `pm2 → pnpm preview` con `.env.prod`; `ecosystem.config.js` no canónico. Spec y tickets 04/05/08/09 alineados (Stage 1 de documentación, sin tocar servicio).
- Pendiente Stage 2 (decisiones del operador): literal final de sesiones de prod en `.env.prod` (vigente `/home/javier/coding-agent-sessions` vs gemelo con datos `/home/javier/coding-agent/sessions`); `pm2 save`.
- Stage 2 completado (2026-09-02): `.env.prod` → `CODING_AGENT_SESSIONS_DIR=/home/javier/coding-agent/sessions` (gemelo con datos; efectivo en el próximo arranque); `pm2 save` hecho (definición real: `pnpm preview` + env embebido `.env.prod`); `.env.development.local` **recreado como backup gitignored** (raíz + `packages/chatbot/`) por decisión del operador "por si debemos recuperarlo" — no lo elimina ningún ticket futuro.
- Pendiente Stage 3: desarrollar 04 → 05 → 06 → 07 → 08 → 09 con verificación de arranque en cada ticket (regla de blindaje).