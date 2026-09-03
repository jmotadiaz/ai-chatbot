# Build exclusivo del Entorno de Producción y eliminación de start

El concepto de "Build" aplica exclusivamente al Entorno de Producción. Los Entornos de Desarrollo y Test carecen de fase de build: Next.js y el Coding Agent Worker compilan bajo demanda en memoria (`next dev`, `tsx`), y las suites de test ejecutan sobre ese runtime dinámico.

## Decisión

1. **`build` es producción**:
   - `build` compila producción (artefactos en disco: `.next` en chatbot, `dist/` en worker) bajo gate `ALLOW_PROD_BUILD=1`.
   - Compatible nativamente con plataformas de despliegue como Vercel (`npm run build`).
   - Se eliminan las nociones `build:prod` (redundante) y `build:dev` (inexistente conceptualmente).
2. **Verificación aislada con `build:verify`**:
   - `build:verify` realiza una compilación de producción hacia directorios descartables (`.next/verify`, `dist/verify`, `.pi-verify`), sin gate y sin tocar el runtime de producción bajo pm2. Es la vía exclusiva para agentes y CI.
3. **Eliminación del concepto `start` / `start:prod`**:
   - La ejecución se delimita estrictamente a dos comandos por entorno:
     - Desarrollo: `dev` (`pnpm dev` en raíz, `dev` por package).
     - Producción: `preview` (`pnpm preview` en raíz bajo pm2, `preview` por package).
   - Se eliminan `start` y `start:prod` de todo el monorepo.
4. **Cero alias en Base de Datos**:
   - Todo comando de base de datos especifica obligatoriamente el entorno (`db:dev:migrate`, `db:test:migrate`, `db:prod:migrate`, `db:seed:dev`, `db:seed:test`). No existe `db:migrate` genérico sin sufijo.

## Opciones consideradas

- (A) Forzar simetría con `build:dev`, `build:test`, `build:prod`. Descartado porque dev y test no generan artefactos persistidos; `build:dev` no tenía utilidad real y generaba confusión en deploys.
- (B) Mantener `build:prod` y crear `build` como alias. Descartado por añadir indirección innecesaria: si build es solo de prod, llamarlo `build` es lo más directo.

## Consecuencias

- En la raíz: `build` y `build:verify` ejecutan en paralelo ambos paquetes (`chatbot` y `coding-agent`).
- En `packages/chatbot`: se eliminan los scripts cruzados que ejecutaban el worker (`build:worker`, `worker:dev`).
- `preview` en chatbot y worker arranca directamente sus binarios (`next start -p 8085` y `node --import tsx dist/...`) sin pasar por scripts `start`.
