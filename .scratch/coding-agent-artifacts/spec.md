# Spec: Renderizado de Artifacts del Coding Agent en la UI del Chatbot

**Status:** ready-for-agent

## Problem Statement

Cuando el Coding Agent genera un **Artifact** visual o interactivo (diagramas de arquitectura con `archify`, informes HTML con `improve-codebase-architecture`, prototipos o vistas interactivas), hoy la tool `publish_artifact` copia un archivo suelto a `<artifactsDir>/<project>/<file>` y devuelve una URL absoluta que apunta directamente al servidor HTTP del Coding Agent Worker (`:3015` en prod / `:3016` en dev).

Esto presenta varios problemas:
1. El usuario sale de la UI del Chatbot a una pestaña externa sin `Header`, sin `Sidebar` y sin botón para regresar a la Coding Agent Session.
2. Obliga a exponer el puerto del Coding Agent Worker al navegador del usuario y a mantener una URL de red local (`codingAgentArtifactsUrl`) en la configuración por Environment.
3. No existe una estructura de carpeta por Artifact (`<name>/index.html`) ni un nombre explícito controlado por la tool `publish_artifact`.
4. Un listener implícito en `tool_result` autopublica cualquier escritura en `/tmp/*.html|*.md` y añade sufijos `-<hash>` al republicar en vez de actualizar el Artifact en su sitio.

## Solution

Integrar la visualización de **Artifacts** dentro de la UI del Chatbot bajo la ruta `/agent/code/[project]/[sessionId]/artifacts/[artifact]`, manteniendo el `Sidebar` y el `Header` del Chatbot (con botón para volver al chat de la sesión) y renderizando el contenido del Artifact en un `<iframe>` con `sandbox="allow-scripts allow-downloads allow-popups"` (sin `allow-same-origin`).

Cada Artifact vive en disco en su propia carpeta `<artifactsDir>/<project>/<name>/index.html`, publicada explícitamente mediante la tool `publish_artifact({ path, name })`. El Chatbot sirve el `index.html` desde una ruta API autenticada leyendo de `codingAgentArtifactsDir`, eliminando el endpoint HTTP `/artifacts` del Worker y la configuración `codingAgentArtifactsUrl`.

## User Stories

1. Como usuario de una Coding Agent Session, quiero hacer clic en el enlace de un Artifact en el chat y navegar dentro de la misma pestaña del Chatbot a la vista del Artifact, para no perder el contexto de mi sesión.
2. Como usuario viendo un Artifact en `/agent/code/[project]/[sessionId]/artifacts/[artifact]`, quiero conservar el `Sidebar` (con mi sesión marcada como activa, sin ensuciar el Sidebar con ítems de artifacts) y el `Header` con el botón "Back to chat", para volver en un clic a la conversación.
3. Como usuario viendo un Artifact interactivo (con Tailwind JIT, Mermaid, scripts inline o botones de descarga), quiero que el Artifact se ejecute dentro de un `<iframe>` aislado (`sandbox="allow-scripts allow-downloads allow-popups"` sin `allow-same-origin`), para que sus scripts, descargas y enlaces funcionen sin tener acceso a las cookies ni al DOM del Chatbot.
4. Como Coding Agent ejecutando `publish_artifact`, quiero pasar `{ path, name }` para publicar el HTML en `<artifactsDir>/<project>/<name>/index.html` y recibir la ruta `/agent/code/<project>/<sessionId>/artifacts/<name>` lista para enlazar en Markdown.
5. Como usuario que pide al Coding Agent iterar sobre un Artifact existente, quiero que al volver a publicar con el mismo `name` se sobreescriba `<name>/index.html`, para que la ruta del Artifact se mantenga estable y muestre siempre la última versión.
6. Como usuario que inspecciona un mensaje generado por un Subagent que publicó un Artifact, quiero que al hacer clic en el enlace del Artifact y luego en "Back to chat" regrese a la vista desde la que hice clic.
7. Como Coding Agent verificando el diseño responsive de un Artifact antes de publicarlo (`check:mobile`), quiero poder pasar la ruta local del archivo `.html` en disco a `check:mobile`, para validarlo con Playwright sin chocar con la autenticación del Chatbot.

## Implementation Decisions

1. **Modelo de dominio (`CONTEXT.md`)**:
   - Se canoniza **Artifact** en `CONTEXT.md` bajo `### Coding Agent` (`_Avoid_: canvas, report, preview`).

2. **Contrato en disco y tool `publish_artifact({ path, name })`**:
   - Cada Artifact se almacena en `<artifactsDir>/<project>/<name>/index.html`.
   - La tool `publish_artifact` recibe únicamente `{ path: string, name: string }` (se elimina el parámetro `title`).
   - `name` identifica la carpeta del Artifact (`[artifact]`); se sanitiza/valida como un segmento de ruta seguro (`isSafeSegment`).
   - `path` puede apuntar a un archivo `.html`/`.htm` (que se copia como `<artifactsDir>/<project>/<name>/index.html`) o a una carpeta que contenga `index.html` (cuyo `index.html` se copia a `<artifactsDir>/<project>/<name>/index.html`). No se admiten otros formatos distintos de HTML.
   - **Sobreescritura**: publicar de nuevo con el mismo `name` sobreescribe `<artifactsDir>/<project>/<name>/index.html` en el sitio (se elimina la deduplicación con sufijo `-<hash>`).
   - **Sin autopublicado silencioso**: se elimina el hook `pi.on("tool_result")` que autopublicaba escrituras de la tool `write` en `/tmp`. Solo la invocación explícita a `publish_artifact` publica un Artifact.
   - **URL devuelta**: `publish_artifact` obtiene `sessionId` desde `ctx.sessionManager.getSessionId()` y `project` desde `projectSlug(ctx.cwd)`, y devuelve la ruta `/agent/code/<encodeURIComponent(project)>/<encodeURIComponent(sessionId)>/artifacts/<encodeURIComponent(name)>`.

3. **Eliminación del HTTP `/artifacts` en el Worker y de `codingAgentArtifactsUrl`**:
   - Se elimina el módulo HTTP de artifacts del Worker (`artifacts-http.ts`), su enrutado en el transporte HTTP del Worker y la resolución `resolveArtifactsBaseUrl` / `getArtifactsBaseUrl`.
   - Se elimina `codingAgentArtifactsUrl` de `StructuralConfig`, de la fachada de `config` y de los bundles `prod` y `dev`.

4. **Entrega HTTP interna en el Chatbot**:
   - Nueva ruta autenticada con `withAuth` en el Chatbot: `GET /api/agent/code/[project]/artifacts/[artifact]`.
   - Verifica `config.codingAgentEnabled()`, valida que `project` y `artifact` sean segmentos seguros (`isSafeSegment`) y resuelve `<codingAgentArtifactsDir>/<project>/<artifact>/index.html` comprobando contención dentro de `codingAgentArtifactsDir`.
   - Responde `200` con `Content-Type: text/html; charset=utf-8`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` y la cabecera `Content-Security-Policy` para Artifacts (permitiendo scripts/estilos inline, `'unsafe-eval'` para Tailwind CDN y los orígenes `https://cdn.tailwindcss.com`, `https://cdn.jsdelivr.net`, `https://unpkg.com`). Si no existe, responde `404`.

5. **Vista del Artifact en el Chatbot (`/agent/code/[project]/[sessionId]/artifacts/[artifact]`)**:
   - Página Server Component protegida con `withAuth` y guard `config.codingAgentEnabled()`.
   - Renderiza `<Sidebar user={user} />` (al compartir el prefijo `/agent/code/[project]/[sessionId]`, `AgentCodeSection` mantiene abierto el proyecto y marcada como activa la sesión automáticamente, sin añadir ítems de artifacts en el Sidebar).
   - Renderiza `<Header.Container>` siguiendo el patrón de `FileBrowserPage`:
     - `<Header.Left>`: `<Logo />`, `<Link href="/agent/code/[project]/[sessionId]" aria-label="Back to chat">` con icono `ArrowLeft`, y el título/nombre del Artifact truncado.
     - `<Header.Right>`: `<ThemeToggle />`.
   - En `<Main>`, un contenedor `h-full pt-16` con `<iframe src="/api/agent/code/[project]/artifacts/[artifact]" sandbox="allow-scripts allow-downloads allow-popups" className="size-full border-0" />` (sin `allow-same-origin`).

6. **Interceptación de enlaces en el Chat (`CodingAgentMarkdownAnchor`)**:
   - Cuando `CodingAgentMarkdownAnchor` recibe un `href` que apunta a una ruta de Artifact (`/agent/code/<project>/<sessionId>/artifacts/<artifact>`), lo intercepta y renderiza un `<Link>` de Next.js hacia `/agent/code/${project}/${sessionId}/artifacts/${artifact}` usando el `project` y `sessionId` del contexto activo (`useFileBrowser()`), de modo que la navegación ocurre en la misma pestaña y el botón "Back to chat" siempre regresa a la vista desde la que el usuario hizo clic.

7. **Verificación mobile-first (`check:mobile`)**:
   - `scripts/check-mobile.ts` acepta tanto URLs (`http://`, `https://`, `file://`) como rutas de archivo locales en disco (convirtiéndolas a `pathToFileURL(path).href` antes de `page.goto`), permitiendo validar el HTML en `/tmp` antes de publicarlo.

## Testing Decisions

- **Buenas prácticas**: testear comportamiento externo observable a través de las fronteras públicas (archivos creados y respuesta de `publish_artifact`, respuestas HTTP del route handler, renderizado de `<Link>` en `AgentResponse` y del `<iframe sandbox>` en la vista de Artifact), nunca detalles internos.
- **`packages/coding-agent` (unit)**:
  - `publishArtifact` y la extensión `publish_artifact`: creación de `<project>/<name>/index.html` desde archivo `.html` o desde carpeta con `index.html`, sobreescritura al repetir `name`, rechazo de archivos no HTML o nombres inseguros, formato de la ruta `/agent/code/<project>/<sessionId>/artifacts/<name>`, y ausencia de autopublicado en `write`.
- **`packages/config` (unit)**:
  - Actualización de los tests de bundles de entorno tras retirar `codingAgentArtifactsUrl`.
- **`packages/chatbot` (unit + E2E)**:
  - Unit test de `parseArtifactHref` / `CodingAgentMarkdownAnchor` en `AgentResponse` (precedente: `tests/unit/agent-code/agent-response.test.tsx` y `file-links.test.ts`).
  - Unit test del route handler `GET /api/agent/code/[project]/artifacts/[artifact]` verificando auth, contención de rutas, `404`, `200`, `Content-Type` y `Content-Security-Policy`.
  - Unit test de `ArtifactPage` verificando el enlace "Back to chat" y los atributos `src` y `sandbox="allow-scripts allow-downloads allow-popups"` (sin `allow-same-origin`) del `<iframe>`.
  - E2E en Playwright verificando la navegación desde un enlace de Artifact en el chat hasta la vista con iframe y el retorno al chat.

## Out of Scope

- Añadir una lista o sección de Artifacts en el `Sidebar`.
- Servir tipos de archivo no HTML (markdown, PDF, CSV, JSON) como Artifacts: esos formatos pertenecen al **File Browser** o respuestas del chat.
- Historial de versiones con hash por Artifact (la republicación con el mismo `name` sobreescribe en sitio).

## Issues

- `issues/01-publish-artifact-folder-contract.md`
- `issues/02-chatbot-artifact-view-and-link.md`
- `issues/03-skills-mobile-check-and-e2e.md`
