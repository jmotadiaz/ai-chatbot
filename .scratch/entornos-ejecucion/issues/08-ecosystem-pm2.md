# 08: Blindaje de la vía canónica de prod (pm2 → pnpm preview)

**What to build:** La vía de arranque real de prod es 1 app `pm2 → pnpm preview` con `.env.prod` (ADR 0003 v2). Blindarla para que un restart/reboot nunca vuelva a fallar: definición guardada (pm2 save) correcta, sin referencias a `.env.development.local`, y ecosystem alineado o declarado no canónico.

**Blocked by:** 06: Build chatbot aislado y verificación, 07: Build worker aislado y verificación

**Status:** ready-for-agent

- [ ] `pm2 save` fija la definición real del app `ai-chatbot` (`script: pnpm`, `args: preview`, cwd raíz, env `.env.prod` embebido); el dump guardado no referencia `.env.development.local`
- [ ] `ecosystem.config.js` se alinea con la vía canónica (1 app `preview` + `env_file: .env.prod`) o se marca explícitamente como no canónico; su app `worker:dev` ya no puede arrastrar `.env.dev` si alguien lo arranca por error
- [ ] Se mantienen (NO se crean ni se eliminan): `preview` (raíz+chatbot) como orquestador; `build:prod`/`build:prod:verify` (tickets 06/07) como insumos de CI/verificación; `start:prod` queda disponible como evolución futura a 2 apps (ADR 0003), no usado por la vía canónica
- [ ] Verificación: `pm2 restart ai-chatbot` con la vía canónica responde `8085` (chatbot) + `3015` (worker) y migra/levanta `5435/prod`; sin referencias a `.env.development.local` en dump ni scripts de arranque