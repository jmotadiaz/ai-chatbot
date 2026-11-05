# 01: Contrato de carpeta `<name>/index.html` en `publish_artifact` y retirada de `/artifacts` del Worker

**What to build:** Actualizar `publish_artifact` en `packages/coding-agent` para que reciba `{ path, name }`, almacene cada Artifact como `<artifactsDir>/<project>/<name>/index.html` sobreescribiendo cuando `name` coincida, devuelva la ruta del Chatbot `/agent/code/<project>/<sessionId>/artifacts/<name>` y elimine tanto el autopublicado implícito en `write` como el servidor HTTP `/artifacts` del Worker y `codingAgentArtifactsUrl` de `packages/config`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `publish_artifact` recibe únicamente `{ path: string, name: string }` (se elimina el parámetro `title`).
- [ ] `name` se valida/sanitiza como segmento seguro (`isSafeSegment`) y define la carpeta destino `<artifactsDir>/<project>/<name>/index.html`.
- [ ] `path` acepta o bien un archivo `.html`/`.htm` (copiado a `<artifactsDir>/<project>/<name>/index.html`) o bien un directorio que contenga `index.html` (cuyo `index.html` se copia a `<artifactsDir>/<project>/<name>/index.html`). Cualquier ruta inexistente, carpeta sin `index.html` o archivo no HTML devuelve un error descriptivo sin lanzar excepciones no controladas al bucle del agente.
- [ ] Publicar de nuevo con el mismo `name` sobreescribe `<artifactsDir>/<project>/<name>/index.html` en el sitio (sin sufijos `-<hash>`).
- [ ] `publish_artifact` (y el comando `/artifacts`) devuelven la ruta de la vista del Chatbot `/agent/code/<encodeURIComponent(project)>/<encodeURIComponent(sessionId)>/artifacts/<encodeURIComponent(name)>` usando `ctx.sessionManager.getSessionId()`.
- [ ] Se elimina el listener `pi.on("tool_result")` que autopublicaba silenciosamente escrituras de `write` en el directorio temporal del sistema.
- [ ] Se elimina el endpoint HTTP `GET /artifacts` del Worker (`artifacts-http.ts`, su enrutado en el transporte HTTP del Worker, su export en `package.json` y `resolveArtifactsBaseUrl` / `getArtifactsBaseUrl`) y se retira `codingAgentArtifactsUrl` de `packages/config`.
- [ ] Tests unitarios actualizados y en verde en `packages/coding-agent` y `packages/config`, verificados con `pnpm verify:fast`.
