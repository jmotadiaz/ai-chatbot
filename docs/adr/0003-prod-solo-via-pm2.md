# Producción solo vía pm2, dev y test vía pnpm (enmendado 2026-09-02)

Solo el Entorno de Producción se levanta con `pm2`; Test y Desarrollo se levantan con `pnpm` (`pnpm dev`, `pnpm --filter chatbot test:e2e`). No se usa pm2 fuera de prod para mantener el ciclo local simple y evitar que un `pm2` local capture puertos o logs de dev.

Puertos fijos: `dev: chatbot 3000 + worker 3016 + pg 5433`, `test: chatbot 3001 + worker stub + pg 5434`, `prod: chatbot 8085 + worker 3015 + pg 5435`. Prod conserva `3015` histórico; dev mueve su worker a `3016` para coexistir en la misma máquina.

## Decisión (vía canónica de arranque de prod)

**1 app `pm2 → pnpm preview`** (raíz del repo), con el Entorno embebido:

- `pm2 start pnpm --name ai-chatbot -- preview` (definición guardada con `pm2 save`).
- `preview` (raíz) = `dotenv -o -e .env.prod -- sh -c 'pnpm --filter chatbot db:prod:start && pnpm --filter chatbot build && concurrently "pnpm --filter chatbot start" "dotenv -o -e .env.prod -- pnpm --filter coding-agent transport:http"'` — levanta la DB de prod (5435/prod), migra y compila, y arranca chatbot (8085) + worker (3015) en paralelo.
- El nombre `preview` es cosmético; lo importante es el contrato: un único comando pm2 → pnpm, con `.env.prod` explícito (`dotenv -o`, sin herencia de entorno).

## Trade-off aceptado (documentado para no redescubrirlo)

- **Reinicio conjunto**: un crash del worker reinicia el grupo entero (el chatbot cae segundos junto a él). Mitigación: `autorestart` de pm2.
- **Rebuild en cada arranque**: `preview` ejecuta migrate + `next build` → ventana de ~1–2 min sin servicio por reinicio. Es el mismo coste que tendría `start:prod` autosuficiente; CI puede pre-compilar si se quiere.
- **Logs mezclados** entre chatbot y worker (concurrently).

## Lo que NO es canónico

- `ecosystem.config.js` queda como **plan B no probado**: su app `worker:dev` arrastra el script raíz que carga `.env.dev`, por lo que **no debe arrancarse** hasta que se alinee con la vía canónica. La definición realmente guardada en pm2 (dump) puede divergir del fichero; verificar con `pm2 jlist` antes de cualquier operación.

## Evolución futura (no comprometida)

Si el trade-off del reinicio conjunto deja de ser aceptable, migrar a **2 apps pm2→pnpm** (`start:prod` por package, chatbot y worker por separado) es el camino: un crash del worker no tumba el chatbot. Requiere primero los builds aislados (tickets 06/07) y es independiente de este ADR mientras no se ejecute.

## Enmiendas

- **2026-09-02**: se reemplaza la decisión previa "2 apps pm2→pnpm con `start:prod`" por "1 app `pm2 → pnpm preview` con `.env.prod`". Motivación: incidente del 2026-09-02 — la vía previa (ecosystem con `env_file: .env.development.local` + script `preview` eliminado del catálogo) se rompió al borrar el fichero de entorno; la recuperación versionó `preview` a `.env.prod` y quedó como vía que funciona. Se mantiene como riesgo aceptado el reinicio conjunto con rebuild.