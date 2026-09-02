# Spec: Entornos de ejecución aislados (test / dev / prod)

## Problem Statement

Hoy los Entornos de Desarrollo y Producción comparten la misma base de datos y el mismo Runtime Pi (mismo `agent dir`, `sessions`, `artifacts`, `models.json` y `auth.json` global). El `ecosystem.config.js` existente levanta ambos servicios con el mismo `.env.development.local` y el worker en modo dev (`tsx`), y los scripts `db:*` / `jules:*` mezclan responsabilidades. Esto hace que el agente —que debe probar en test/dev— pueda escribir o leer estado de producción por accidente (chats, proyectos, sesiones del Coding Agent, trazas y artifacts). No hay forma de levantar dev, test y prod en la misma máquina sin colisión de puertos ni de estado, ni de garantizar que el Usuario de Test nunca exista en producción.

## Solution

Introducir tres Entornos aislados —Test, Desarrollo y Producción— cada uno con su propia base de datos, su propio Runtime Pi (auth, models, artifacts y packages por Entorno; **prod conserva sus valores de runtime vigentes y funcionando**, ADR 0002 v2) y su propia configuración (todas las variables duplicadas por Entorno). Test queda reservado a e2e con su DB efímera y runtime efímero; Desarrollo es persistente con Usuario de Test pre-seedeado ligero; Producción es persistente, el único supervisado por pm2 vía `pnpm` con un único comando `preview` (pm2 → pnpm, `.env.prod`). Se fijan puertos distintos por Entorno, se separan los compose files y los scripts, se elimina `.env.development.local` en favor de `.env.dev`/`.env.prod` (ignorados) y `.env.test` versionado con secrets fake, y se añaden guardarraíles que validan la coherencia entre el Entorno declarado y la URL de la base de datos.

## User Stories

1. Como operador, quiero levantar el Entorno de Desarrollo con `pnpm dev` y que use su propia DB y Runtime Pi sin tocar prod, para poder desarrollar con datos reales sin riesgo.
2. Como operador, quiero levantar el Entorno de Producción con `pm2 start ecosystem.config.js` y que use su propia DB y Runtime Pi, para que prod sea el único supervisado por pm2.
3. Como agente, quiero ejecutar tareas en el Entorno de Test sin interferir en prod, para poder probar cambios de código de forma segura.
4. Como agente, quiero ejecutar tareas en el Entorno de Desarrollo sin interferir en prod, para iterar con un Usuario de Test real.
5. Como desarrollador, quiero que `pnpm test:e2e` use exclusivamente la DB de Test, para que los e2e no contaminen dev ni prod.
6. Como desarrollador, quiero que cada Entorno tenga su propio `auth.json` del Runtime Pi, para que credenciales y modelos no se filtren entre Entornos.
7. Como desarrollador, quiero que `POSTGRES_URL`, `PORT`, `CODING_AGENT_*`, `TRACE_DIR` y demás estén duplicadas por Entorno, para que no haya herencia implícita.
8. Como operador, quiero que los puertos de chatbot, worker y postgres no colisionen entre Entornos en la misma máquina, para poder tener dev y prod levantados a la vez.
9. Como operador, quiero que prod conserve sus puertos históricos (chatbot 8085, worker 3015, postgres 5435), para no cambiar infra existente.
10. Como desarrollador, quiero que `db:seed:test` resetee completamente el Entorno de Test, para que cada corrida e2e parta de un estado determinístico.
11. Como desarrollador, quiero que `db:seed:dev` sea ligero e idempotente sin reset, para que `pnpm dev` arranque rápido sin borrar datos locales.
12. Como operador, quiero que prod nunca contenga el Usuario de Test, para que no exista credencial de prueba en tráfico real.
13. Como desarrollador, quiero que `seed:dev` y `seed:test` sean comandos distintos, para no confundir volumen de datos de dev y test.
14. Como operador, quiero que `.env.dev` y `.env.prod` estén gitignored y `.env.test` esté versionado con secrets fake, para que CI funcione sin setup y prod no se filtre.
15. Como desarrollador, quiero que al eliminar `.env.development.local` no quede alias oculto, para que la migración a `.env.dev`/`.env.prod` sea explícita.
16. Como desarrollador, quiero que la resolución del fichero de entorno mapee `NEXT_PUBLIC_ENV` a `.env.test`/`.env.dev`/`.env.prod`, para que el código no lea `process.env` directo.
17. Como desarrollador, quiero que el catálogo central de variables siga siendo la única fuente de verdad y que `src/` nunca lea `process.env`, para mantener la regla del paquete config.
18. Como desarrollador, quiero que la validación falle rápido si `NEXT_PUBLIC_ENV` y `POSTGRES_URL` no coinciden en ningún Entorno (test↔dev, dev↔prod, test↔prod), para evitar escribir en la DB equivocada.
19. Como desarrollador, quiero que `TRACE_DIR` esté aislado por Entorno, para que trazas de dev no sobrescriban las de test o prod.
20. Como desarrollador, quiero que `CODING_AGENT_ARTIFACTS_DIR` y `CODING_AGENT_SESSIONS_DIR` diferencien Entornos (dev/test aislados en `.pi-*`; **prod conserva su carpeta de sesiones vigente con su historial**, ADR 0002 v2), para que reports y sesiones de dev no se mezclen con los de prod.
21. Como desarrollador, quiero que `CODING_AGENT_MODELS_JSON` y `CODING_AGENT_PI_PACKAGES_DIR` estén aislados por Entorno, para que modelos y paquetes no se compartan.
22. Como operador, quiero que `pm2` ejecute **un único comando `pm2 → pnpm preview`** con `.env.prod` (1 app, raíz del repo), para respetar la regla pm2 ejecuta pnpm y mantener la vía de arranque que funciona (ADR 0003 v2).
23. Como operador, quiero que `build:prod` del chatbot sea invocable solo (migrate + next build) para que CI pueda pre-compilar/verificar, sin cambiar la vía de arranque (`preview` ya compila).
24. Como operador, quiero que `build:prod` del worker sea invocable solo (`tsc` + `generate-models`) para no recompilar en cada restart si no hace falta; `start:prod` queda como evolución futura a 2 apps (ADR 0003), no usado por la vía canónica.
25. Como operador, quiero que `build:prod` del chatbot incluya `migrate` antes de `next build`, para que el build no falle por schema desactualizado (ver *Implementation Decisions* → Garantía `build:prod` y verificación aislada por el agente).
26. Como operador, quiero que `build:prod` del worker incluya `tsc` y `generate-models`, para que `models.json` quede por Entorno.
27. Como desarrollador, quiero que los scripts `db:*` se renombren a `db:dev:*`, `db:test:*`, `db:prod:*` y se eliminen `db:jules:*` y `jules:start`, para simplificar el contrato.
28. Como desarrollador, quiero que `db:start` sin sufijo se elimine sin alias, para que no se levante por accidente la DB compartida antigua.
29. Como desarrollador, quiero que cada compose file tenga `name`, `container_name` y volumen únicos por Entorno, para que `docker compose` no colisione.
30. Como desarrollador, quiero que `drizzle.config` y el migrator resuelvan el `.env` del Entorno activo antes de leer `POSTGRES_URL`, para que cada Entorno migre su propia DB.
31. Como operador, quiero que dev y test se sigan levantando con `pnpm` (sin pm2), para mantener el ciclo local simple.
32. Como desarrollador, quiero que el `webServer` de Playwright siga usando `NEXT_PUBLIC_ENV=test` y el stub del worker, para que e2e no requiera worker real.
33. Como desarrollador, quiero poder pre-compilar prod con `build:prod` y luego solo `pm2 start` sin rebuild, para deploys rápidos.
34. Como auditor, quiero ADRs que expliquen por qué 3 compose files en lugar de profiles, por qué auth aislado, por qué pm2 solo en prod y por qué 2 apps vs 1 app monorepo, para entender las decisiones sin preguntar.

## Implementation Decisions

- Tres Entornos canónicos con vocabulario del glosario: Test (efímero, solo e2e), Desarrollo (persistente con Usuario de Test), Producción (persistente, único vía pm2). Cada Entorno duplica todas las variables.
- Base de datos por Entorno: tres compose files separados (no profiles) con puertos fijos (dev 5433/dev, test 5434/test, prod 5435/prod), `POSTGRES_DB` = nombre del Entorno, `name`/`container_name`/volumen únicos. Se elimina el compose compartido y los scripts `jules`.
- Ficheros de entorno: `.env.dev` y `.env.prod` gitignored con secrets reales, `.env.test` versionado con secrets fake; se elimina `.env.development.local` sin alias. Resolución por `NEXT_PUBLIC_ENV` → `.env.*` correspondiente.
- Catálogo central: el paquete config sigue siendo la única fuente de verdad; toda lectura pasa por el objeto tipado, nunca `process.env` en `src/`. Se exponen las claves de Runtime Pi por Entorno (incluido `CODING_AGENT_AUTH_JSON`).
- Runtime Pi: `authJson`, `modelsJson`, `agentDir`, `piPackagesDir` y `artifactsDir` por Entorno; `sessionsDir` aislado para dev/test (`.pi-dev/sessions`, `.pi-test/sessions`) y **prod conserva su carpeta de sesiones vigente con su historial** (sin migración; ADR 0002 v2). Relativos se resuelven contra el package del worker, no contra el cwd. Directorios hermanos `.pi-dev`/`.pi-test`/`.pi-prod` ignorados.
- Guardarraíl de coherencia: validación en el acceso a `POSTGRES_URL` y fail-fast en el setup e2e que comprueba que `NEXT_PUBLIC_ENV` y el DSN coinciden (test↔5434/test, dev↔5433/dev, prod↔5435/prod).
- Trazas y artifacts aislados por Entorno (`TRACE_DIR`, `CODING_AGENT_ARTIFACTS_DIR` por Entorno) para evitar sobrescritura entre corridas.
- Usuario de Test solo en Test y Desarrollo: dos seeds distintos, `seed:test` con `--reset` y volumen pesado para e2e, `seed:dev` con `--no-reset` y volumen ligero para `pnpm dev`. Producción nunca lo contiene ni lo migra.
- Supervisión: solo Producción vía pm2 con **1 app `pm2 → pnpm preview`** (raíz) y `.env.prod` embebido (`dotenv -o`); el `ecosystem.config.js` queda declarado no canónico (ADR 0003 v2). Dev y test vía `pnpm` sin pm2.
- Scripts por Entorno en el worker: `build:prod` (chatbot: migrate + next build; worker: tsc + generate-models) invocable independiente para CI, y `preview` (raíz) como orquestador canónico de prod (`db:prod:start && build && concurrently start + worker` con `.env.prod`); `start:prod` autosuficiente queda disponible como evolución futura a 2 apps (ADR 0003), no usado por la vía canónica. Puertos fijos por Entorno (prod conserva 3015, dev mueve worker a 3016). El `webServer` de Playwright mantiene stub en test.
- Garantía `build:prod` y verificación aislada por el agente: el agente **sí puede ejecutar `build:prod:verify` para verificar que el proyecto compila**, pero nunca debe pisar los artefactos que sirve prod. Por eso `build:prod` (operador/CI) escribe a `.next` (chatbot) y `dist/`+`.pi-prod` (worker) y alimenta CI o una futura vía `start:prod` a 2 apps (ADR 0003 v2); la vía canónica actual (`preview`) compila y arranca por su cuenta en cada arranque. `build:prod:verify` (agente) escribe a directorios aislados (`NEXT_BUILD_DIR=.next/verify` vía `next.config` `distDir` parametrizable para chatbot y `dist/verify`+`.pi-verify` para worker) que se descartan tras la verificación. Ambos comparten el mismo `migrate` previo, pero solo `build:prod` alimenta prod. `preview` bajo pm2 sigue siendo autosuficiente (compila y arranca), pero si el agente dispara `build:prod:verify` en la misma máquina mientras prod está levantado, no hay rebuild concurrente sobre `.next`/`dist` que rompa la ejecución en curso. El guardarraíl `NEXT_PUBLIC_ENV ↔ POSTGRES_URL` y `ALLOW_PROD_BUILD` siguen aplicando a `build:prod`; `build:prod:verify` no lo requiere porque no toca prod.
- Migraciones resuelven el `.env` del Entorno activo antes de leer `POSTGRES_URL`, de modo que cada Entorno migra su propia DB; `drizzle.config` sigue el mismo mapeo.
- Documentación para el agente: se modifica `AGENTS.md` (raíz y `packages/coding-agent/AGENTS.md` si aplica) para que el flujo de trabajo del agente ejecute **siempre `build:prod:verify`** (chatbot y worker) para comprobar compilación, **prohibiendo explícitamente `build:prod` y `start:prod`** (reservados a ejecución manual del operador/CI). El `AGENTS.md` debe advertir que `build:prod` pisa `.next`/`dist` de prod y rompería la ejecución en curso si el agente lo dispara mientras pm2 sirve prod.

### Catálogo final de scripts por package

**Raíz (`package.json`) — orquestación monorepo:**
- `dev` → `dotenv -e .env.dev -- pnpm --filter chatbot --filter coding-agent --parallel dev` (única vía dev, ya no usa `.env.development.local`)
- `build:prod` → `pnpm --filter chatbot build:prod && pnpm --filter coding-agent build:prod` (compila ambos, invocable por CI sin pm2)
- `db:dev:start` / `db:dev:stop` → delegan a `chatbot:db:dev:*` (dev 5433/dev)
- `db:test:start` / `db:test:stop` → delegan a `chatbot:db:test:*` (test 5434/test, usado por `test:e2e`)
- `db:prod:start` / `db:prod:stop` → delegan a `chatbot:db:prod:*` (prod 5435/prod)
- `db:dev:logs` → `docker compose -f ../../docker-compose.dev.yml logs -f`
- `db:test:logs` → `docker compose -f ../../docker-compose.test.yml logs -f`
- `db:prod:logs` → `docker compose -f ../../docker-compose.prod.yml logs -f`
- Se eliminan sin alias: `db:logs` genérico, `db:start`, `db:stop`, `db:jules:*`, `jules:start`, `agent:start` (reemplazado por `db:dev:*` + `dev`). Se mantienen: `preview` (vía canónica de prod, 1 app pm2 → pnpm con `.env.prod`, ADR 0003 v2) y `start` monorepo paralelo (dev).
- Se mantienen: `lint`, `type:check`, `test:*`, `verify:fast`, `eval`, `mcp:*`, `transport:http` (ahora con `.env.dev`)

**`packages/chatbot` — Next.js + DB:**
- `dev` → `npm run db:dev:start && next dev` (`PORT` 3000 dev / 3001 test vía `NEXT_PUBLIC_ENV`, sin `dotenv` interno — lo aporta la raíz)
- `build` → `dotenv -e ../../.env.dev -- npx tsx lib/infrastructure/db/migrate.ts && next build` (explícito, mismo comando que `build:dev`)
- `build:dev` → `dotenv -e ../../.env.dev -- npx tsx lib/infrastructure/db/migrate.ts && next build`
- `build:prod` → `dotenv -e ../../.env.prod -- npx tsx lib/infrastructure/db/migrate.ts && next build` (escribe a `.next`; solo operador/CI antes de `pm2 reload`)
- `build:prod:verify` → `dotenv -e ../../.env.prod -- NEXT_BUILD_DIR=.next/verify npx tsx lib/infrastructure/db/migrate.ts && NEXT_BUILD_DIR=.next/verify next build` (verificación aislada para el agente; escribe a `.next/verify` y se descarta, no pisa `.next` de prod)
- `start` → `next start -p 8085` (genérico, PORT vía env)
- `start:prod` → `pnpm run build:prod && next start -p 8085` (autosuficiente; lo ejecuta pm2; `build:prod` invocable solo; el agente usa `build:prod:verify` si solo quiere comprobar compilación)
- `db:dev:start` → `docker compose -f ../../docker-compose.dev.yml up -d --wait`
- `db:dev:stop` → `docker compose -f ../../docker-compose.dev.yml down`
- `db:test:start` → `docker compose -f ../../docker-compose.test.yml up --wait` (sin cambios)
- `db:test:stop` → `docker compose -f ../../docker-compose.test.yml down`
- `db:prod:start` → `docker compose -f ../../docker-compose.prod.yml up -d --wait`
- `db:prod:stop` → `docker compose -f ../../docker-compose.prod.yml down`
- `db:dev:migrate` → `dotenv -e ../../.env.dev -- npx tsx lib/infrastructure/db/migrate.ts`
- `db:test:migrate` → `dotenv -e ../../.env.test -- npx tsx lib/infrastructure/db/migrate.ts`
- `db:prod:migrate` → `dotenv -e ../../.env.prod -- npx tsx lib/infrastructure/db/migrate.ts`
- `db:seed:dev` → `npx tsx scripts/seed-test-data.ts --no-reset --chats 5 --user-messages 2 --assistant-messages 2` (ligero, idempotente)
- `db:seed:test` → `npx tsx scripts/seed-test-data.ts --reset --chats 100` (pesado, determinístico, usado por `globalSetup`)
- Se eliminan: `db:start`, `db:stop`, `db:jules:*`, `jules:start`, `agent:start`, `db:seed` genérico y `db:migrate` genérico (reemplazados por `db:<env>:migrate|seed`)
- Se mantienen: `db:generate`, `db:push`, `db:dev:logs`/`db:test:logs`/`db:prod:logs` (por Entorno), `test:*`, `lint`, `type:check`, `eval`, `check:mobile`, `worker:dev` (`pnpm --filter coding-agent transport:http`)

**`packages/coding-agent` — Worker Pi:**
- `dev` → `tsx scripts/install-packages.ts && tsx scripts/generate-models.ts && tsx src/transports/http.ts` (explícito; `transport:http` se elimina por redundante)
- `build:prod` → `tsc -p tsconfig.json --outDir dist && tsx scripts/generate-models.ts` (genera `dist/` + `.pi-prod/models.json` con `CODING_AGENT_*` de `.env.prod`; solo operador/CI antes de `pm2 reload`, escribe al `dist` que sirve prod)
- `build:prod:verify` → `tsc -p tsconfig.json --outDir dist/verify --noEmitOnError false && CODING_AGENT_MODELS_JSON=.pi-verify/models.json tsx scripts/generate-models.ts` (verificación aislada para el agente; escribe a `dist/verify` + `.pi-verify/models.json` y se descarta, no pisa `dist/` de prod)
- `start:prod` → `pnpm run build:prod && node dist/transports/http.js` (autosuficiente; lo ejecuta pm2; `build:prod` invocable solo; el agente usa `build:prod:verify` si solo quiere comprobar compilación)
- Se eliminan: `start` (alias de `dev`), `transport:http` (redundante con `dev`)
- Se mantienen: `lint`, `type:check`, `test:*`, `packages:install`

## Testing Decisions

- Solo se testea comportamiento externo, no detalles de implementación. Un buen test arranca por el contrato visible (config resuelta, DB aislada, pm2 levanta lo esperado) y no por el fichero interno que lo implementa.
- Costuras preferidas (la más alta posible, ideal una por área):
  - **Config**: lectura tipada del catálogo y resolución de `.env.*` (highest seam). Prior art: tests de `packages/config` que stubbean `process.env` y ejercitan `config.*` throw/optional.
  - **DB**: `docker compose` por Entorno + migrator/seed por Entorno (integration contra Postgres real por Entorno, como hoy `globalSetup`/`db:test:start`). Prior art: `tests/e2e/global-setup` y scripts `db:*` existentes.
  - **Runtime Pi**: resolución de `agentDir`/`artifactsDir`/`sessionsDir`/`modelsJson`/`authJson` por Entorno (unit sobre `paths`/`models` con overrides relativos). Prior art: `tests/unit/artifacts*` y `paths` del worker.
  - **PM2**: contrato del `ecosystem.config.js` (2 apps, `script: pnpm`, `args: start:prod`, `cwd` por package, `env_file` a `.env.prod`) y scripts `build:prod`/`start:prod` en cada package (contract/integration que parsea el ecosystem y package.json). Prior art: no hay, nueva costura mínima.
  - **E2E**: `webServer` de Playwright con `NEXT_PUBLIC_ENV=test` y stub del worker sigue pasando con la DB de Test aislada. Prior art: `packages/chatbot/playwright.config.ts` y `tests/e2e/*`.
- Se evita añadir nuevas costuras si la existente basta; si hace falta una nueva, se propone en el punto más alto (ej. helper de validación `POSTGRES_URL` ↔ `NEXT_PUBLIC_ENV` testeable vía `config`).

## Out of Scope

- Cambiar de gestor de secretos (systemd LoadCredential, Vault, etc.); el catálogo ya discrimina `secret` para una futura costura, pero este spec no la implementa.
- Añadir nuevos Entornos (staging, preview, evals) más allá de test/dev/prod.
- Modificar el Model Catalog o el Model Router; solo se aísla `models.json` por Entorno, no se cambia su contenido.
- Reescribir el Built-in MCP Server o la Project Knowledge Base; siguen consumiendo `POSTGRES_URL` del Entorno activo sin cambios.
- Introducir `pm2` en dev o test, o usar `pm2` con `watch`/`cluster` en prod.
- Cambiar el mecanismo de Compaction, Memory o Prompt Refiner.
- Migrar datos existentes entre DBs (dev→prod); cada DB parte vacía y se migra/seed por Entorno.

## Further Notes

- Puertos acordados: `dev: chatbot 3000 + worker 3016 + pg 5433`, `test: chatbot 3001 + worker stub + pg 5434`, `prod: chatbot 8085 + worker 3015 + pg 5435`. Prod conserva el worker histórico.
- Directorios Pi hermanos `.pi-dev`/`.pi-test`/`.pi-prod` (no `.pi/dev` anidado) para evitar `rm -rf .pi` accidental.
- `pnpm dev` sigue siendo `dotenv -e .env.dev -- pnpm --filter chatbot --filter coding-agent --parallel dev`; `pnpm test:e2e` sigue delegando a `db:test:start` + Playwright.
- ADRs 0001–0005 registran las decisiones de DB por Entorno, Runtime Pi aislado incluido auth, prod solo vía pm2 (2 apps pm2→pnpm con start:prod autosuficiente), Usuario de Test solo en dev/test, y ficheros de entorno.
