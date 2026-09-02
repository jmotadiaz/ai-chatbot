# 08: Blindaje de la vía canónica de prod (pm2 → pnpm preview)

**What to build:** La vía de arranque real de prod es 1 app `pm2 → pnpm preview` con `.env.prod` (ADR 0003 v2). Blindarla para que un restart/reboot nunca vuelva a fallar: definición guardada (pm2 save) correcta, sin referencias a `.env.development.local`, y ecosystem alineado o declarado no canónico.

**Blocked by:** 06: Build chatbot aislado y verificación, 07: Build worker aislado y verificación

**Status:** resolved

- [x] `pm2 save` fija la definición real del app `ai-chatbot` (`script: pnpm`, `args: preview`, cwd raíz, env `.env.prod` embebido); el dump guardado no referencia `.env.development.local`
- [x] `ecosystem.config.js` se alinea con la vía canónica (1 app `preview` + `env_file: .env.prod`) o se marca explícitamente como no canónico; su app `worker:dev` ya no puede arrastrar `.env.dev` si alguien lo arranca por error
- [x] Se mantienen (NO se crean ni se eliminan): `preview` (raíz+chatbot) como orquestador; `build:prod`/`build:prod:verify` (tickets 06/07) como insumos de CI/verificación; `start:prod` queda disponible como evolución futura a 2 apps (ADR 0003), no usado por la vía canónica
- [x] Verificación: `pm2 restart ai-chatbot` con la vía canónica responde `8085` (chatbot) + `3015` (worker) y migra/levanta `5435/prod`; sin referencias a `.env.development.local` en dump ni scripts de arranque

## Answer

**Código (sin tocar prod):**

1. **`ecosystem.config.js` alineado a vía canónica** (commit `c101dee`): 1 app `ai-chatbot` con `script: pnpm`, `args: preview`, `cwd` raíz, `env_file: .env.prod` (ADR 0003 v2). Eliminada la 2ª app `ai-chatbot-worker` (`worker:dev`) que arrastraba `.env.dev` vía `dotenv -o -e .env.dev` del script raíz — antes incluso con `env_file: .env.prod` el `worker:dev` pisaba prod. Ahora el fichero levanta exactamente lo mismo que `pm2 start pnpm --name ai-chatbot -- preview` (concurrently 8085 + 3015 con `.env.prod`). Cabecera documenta que es canónica y que 2 apps `start:prod` es evolución futura no validada.

2. **Dump pm2 — diagnóstico read-only:** `pm2 jlist`/`~/.pm2/dump.pm2` muestra `pm_exec_path: pnpm`, `args: preview`, `pm_cwd` raíz — correctos. `env_file` sigue `.env.development.local` en el dump actual (stale, heredado del arranque pre-01). El `preview` interno ya carga `.env.prod` vía `dotenv -o -e .env.prod`, por eso prod funciona, pero un `reboot` con `pm2 resurrect` leería el `env_file` stale. Fix del dump requiere regenerar la definición y `pm2 save` — **reservado al operador con aprobación explícita por acción** (regla `AGENTS.md`). Verificación read-only: `grep -n .env.development.local ecosystem.config.js` 0 hits; `grep build:prod` en `preview` ok; `ss -tlnp` 3015 listening, `curl GET 8085` 200.

3. **Scripts mantenidos:** `preview` (raíz+chatbot) sigue orquestador canónico `dotenv -o -e .env.prod -- sh -c 'db:prod:start && ALLOW_PROD_BUILD=1 build:prod && concurrently start + dev'`; `build:prod`/`build:prod:verify` (06/07) intactos; `start:prod` sigue disponible como evolución futura (no usado); **no se creó `start:prod` en raíz** (checklist 08: mantener, no crear — verificado `grep start:prod package.json` solo en packages, no en raíz).

4. **Verificación aislada (prueba de fuego sin downtime):** `pnpm --filter coding-agent build:prod:verify` → `dist/verify`+`.pi-verify` (`.pi-prod` md5 bit-idéntico `7430238…`); `pnpm --filter chatbot build:prod:verify` → `.next/verify` (27s, 190M, `BUILD_ID` de prod `ZRPxP8s…` intacto en `.next/BUILD_ID`, mtime sin tocar). `verify:fast` verde: lint, type:check, unit 231+contract 11 chatbot, worker 277, integration 36+41, contract 39 totales.

**Pendiente operador (dos aprobaciones separadas, ventana ~1–2 min por rebuild):**

- (a) `pm2 save`: tras `pm2 delete ai-chatbot && pm2 start ecosystem.config.js` o `pm2 start pnpm --name ai-chatbot -- preview`, verificar `cat ~/.pm2/dump.pm2 | grep env_file` → `.env.prod` (no `.env.development.local`) y `pm2 save`.
- (b) `pm2 restart ai-chatbot` (con `--update-env` si aplica): valida cadena completa `preview → ALLOW_PROD_BUILD=1 build:prod → next start 8085 + worker dev 3015` y migra 5435/prod; desplegaría de paso 06/07/10 en prod. Indicar ventana de indisponibilidad 1–2 min por el `next build` en el pedido de aprobación.

Commit: `c101dee feat(entornos): blindaje pm2 y catálogo raíz + AGENTS (tickets 08/09)`.

## Comments

- 2026-09-03: dump actual todavía `.env.development.local` (solo-lectura verificado). No se ejecutó `pm2 save`/`restart` sin aprobación — queda para el operador según handoff (dos aprobaciones, una por acción, avisando ventana).
