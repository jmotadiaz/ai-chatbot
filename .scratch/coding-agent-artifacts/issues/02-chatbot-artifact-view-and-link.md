# 02: Vista de Artifact con `<iframe sandbox>` en el Chatbot y navegación `<Link>` desde el Chat

**What to build:** Crear en `packages/chatbot` la vista `/agent/code/[project]/[sessionId]/artifacts/[artifact]` (manteniendo `Sidebar` y `Header` con botón "Back to chat" y renderizando el Artifact en un `<iframe>` sandboxed), el route handler autenticado que sirve `<artifactsDir>/<project>/<artifact>/index.html`, y la interceptación de enlaces de Artifact en `CodingAgentMarkdownAnchor` para navegar con `<Link>` de Next.js en la misma pestaña.

**Blocked by:** 01: Contrato de carpeta `<name>/index.html` en `publish_artifact` y retirada de `/artifacts` del Worker

**Status:** ready-for-agent

- [ ] Route handler `GET /api/agent/code/[project]/artifacts/[artifact]` protegido con `withAuth` y `config.codingAgentEnabled()`: valida que `project` y `artifact` sean segmentos seguros, comprueba contención dentro de `config.codingAgentArtifactsDir()`, lee `<artifactsDir>/<project>/<artifact>/index.html` y responde `200` con `Content-Type: text/html; charset=utf-8`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` y `Content-Security-Policy` para Artifacts (permitiendo scripts/estilos inline, `'unsafe-eval'` y los CDNs `https://cdn.tailwindcss.com`, `https://cdn.jsdelivr.net`, `https://unpkg.com`), o `404` si no existe.
- [ ] Página `/agent/code/[project]/[sessionId]/artifacts/[artifact]` (`page.tsx` y `loading.tsx`) protegida con `withAuth` y `config.codingAgentEnabled()`.
- [ ] La vista mantiene `<Sidebar user={user} />` (la sesión permanece activa en el Sidebar sin añadir ítems de artifacts) y `<Header.Container>` siguiendo el patrón de `FileBrowserPage`: `Logo`, botón `ArrowLeft` ("Back to chat" hacia `/agent/code/[project]/[sessionId]`), nombre/título del Artifact y `ThemeToggle`.
- [ ] El contenido de `<Main>` (`h-full pt-16`) renderiza un `<iframe src="/api/agent/code/[project]/artifacts/[artifact]" sandbox="allow-scripts allow-downloads allow-popups" className="size-full border-0" />` (sin `allow-same-origin`).
- [ ] `CodingAgentMarkdownAnchor` detecta los enlaces con ruta `/agent/code/<project>/<sessionId>/artifacts/<artifact>` y los renderiza como `<Link>` de Next.js apuntando al `project` y `sessionId` activos del contexto (`useFileBrowser()`), navegando en la misma pestaña sin `target="_blank"`.
- [ ] Tests unitarios en `packages/chatbot` para el parser/anchor de enlaces de Artifact, el route handler `GET /api/agent/code/[project]/artifacts/[artifact]` y el componente de la página del Artifact, verificados con `pnpm verify:fast`.
