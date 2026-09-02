# 07: Build worker aislado y verificación

**What to build:** El worker prod compila a `dist/` y el agente verifica en `dist/verify` sin pisar el `dist/` que sirve pm2 en `3015`.

**Blocked by:** 01: Ficheros de Entorno y resolución, 04: Runtime Pi aislado por Entorno

**Status:** ready-for-agent

- [ ] `packages/coding-agent` expone `dev` explícito (`tsx scripts/install-packages.ts && tsx scripts/generate-models.ts && tsx src/transports/http.ts`), sin alias `start` ni `transport:http` redundante
- [ ] `build:prod` → `tsc -p tsconfig.json --outDir dist && tsx scripts/generate-models.ts` (genera `dist/` + `.pi-prod/models.json` con `CODING_AGENT_*` de `.env.prod`)
- [ ] `build:prod:verify` → `tsc --outDir dist/verify && CODING_AGENT_MODELS_JSON=.pi-verify/models.json tsx scripts/generate-models.ts` (verificación aislada para el agente, escribe a `dist/verify`+`.pi-verify` y se descarta)
- [ ] `start:prod` autosuficiente (`pnpm run build:prod && node dist/transports/http.js`) documentado como solo pm2/CI; el agente usa `build:prod:verify`
