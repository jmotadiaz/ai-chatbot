# 03: Soporte de rutas locales en `check:mobile`, actualización de skills y test E2E

**What to build:** Permitir que `check:mobile` valide archivos HTML locales en disco antes de publicar, actualizar la documentación y skills de generación de Artifacts al nuevo contrato `publish_artifact({ path, name })`, y cubrir el flujo extremo a extremo en Playwright.

**Blocked by:** 01: Contrato de carpeta `<name>/index.html` en `publish_artifact` y retirada de `/artifacts` del Worker, 02: Vista de Artifact con `<iframe sandbox>` en el Chatbot y navegación `<Link>` desde el Chat

**Status:** ready-for-agent

- [ ] `pnpm --filter chatbot check:mobile` acepta rutas de archivos HTML locales (convirtiéndolas a `file://...` cuando no sean URLs `http://`, `https://` o `file://`), permitiendo verificar el diseño responsive a 320px y 390px antes de llamar a `publish_artifact`.
- [ ] Las skills y guías del repositorio (`mobile-first-artifacts`, `archify`, `improve-codebase-architecture`, `AGENTS.md`) reflejan la firma `publish_artifact({ path, name })`, la estructura `<name>/index.html` y el uso de `check:mobile` sobre el archivo HTML local.
- [ ] Test E2E en Playwright que verifica la navegación desde un enlace de Artifact en una sesión del Coding Agent hasta `/agent/code/[project]/[sessionId]/artifacts/[artifact]`, comprobando que se mantienen `Header` y `Sidebar`, que el `<iframe sandbox="allow-scripts allow-downloads allow-popups">` carga el `index.html` del Artifact y que el botón "Back to chat" regresa a la sesión.
- [ ] Verificación completa en verde (`pnpm verify:fast`, `pnpm build:verify` y el test E2E).
