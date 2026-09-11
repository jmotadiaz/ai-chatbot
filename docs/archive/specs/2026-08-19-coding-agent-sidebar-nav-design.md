# Diseño — Coding Agent como sección del sidebar

Fecha: 2026-08-19
Estado: borrador pendiente de revisión

## Objetivo

Reestructurar la navegación del coding agent: la página de proyectos/sesiones (`/agent/code`) desaparece y esa vista pasa a vivir en el sidebar. El enlace "Coding Agent" del sidebar deja de ser un link a una landing y se convierte en una **sección** (similar a la sección Projects): una lista de proyectos, y dentro de cada proyecto una lista colapsable de sesiones (máximo 10). Los colapsables son **excluyentes** (solo uno abierto a la vez) y tanto el proyecto como la sesión de la ruta actual quedan **highlighted**.

## Decisiones tomadas (brainstorming)

- **Ruta `/agent/code`**: desaparece → `notFound()` (igual que `/agent/code/[project]`).
- **Creación de sesión**: botón **`+`** en cada fila de proyecto del sidebar (crea sesión con el modelo por defecto y navega a ella).
- **Auto-expand**: el proyecto de la ruta actual se abre automáticamente (carga inicial, deep link y navegación entre proyectos); el toggle manual manda hasta la siguiente navegación. El highlight de proyecto/sesión activa se mantiene siempre.
- **Límite de proyectos**: ninguno (el listado es un `readdir` barato). **Límite de sesiones**: 10 por proyecto (SQL `LIMIT`, orden por `updatedAt` desc).
- **Estado de expansión**: estado local del componente (ya no hay URL `?project=`; la landing que usaba ese query param desaparece).

## Flujo de usuario

1. El sidebar siempre muestra la sección "Coding Agent" (si `config.codingAgentEnabled()`), entre RAGNav y la sección Projects:

```
[ + New Chat      ]
Resources
Coding Agent            ← título de sección (icono CodeXml, estático)
  ai-chatbot      [+]   ← fila proyecto (highlight si ruta actual = este proyecto)
    ▸ sesión-uno        ← filas sesión (máx 10, label ?? sessionId)
    ▸ sesión-dos        ← highlight si ruta actual = esta sesión
    (No sessions yet)   ← empty state cuando no hay ninguna
  otro-proyecto   [+]
```

2. Click en la fila de un proyecto → toggle expand del colapsable. Solo un proyecto puede estar abierto: abrir uno cierra el anterior.
3. Click en el `+` de un proyecto → `createCodingAgentSession(project)` (modelo por defecto) y `router.push` a `/agent/code/<project>/<sessionId>`.
4. Click en una sesión → navega a `/agent/code/<project>/<sessionId>`.
5. Deep link o navegación a una sesión → el proyecto padre se abre automáticamente y la sesión/proyecto quedan highlighted.
6. La landing `/agent/code` ya no existe (notFound).

## Arquitectura

### 1. Nueva sección — `components/layout/sidebar/agent-code-section.tsx` (nuevo)

Componente `"use client"`. Recibe por props la lista de proyectos (fetcheada server-side) y los ids de ruta actual:

```ts
interface AgentCodeSectionProps {
  projects: string[];
}
```

El proyecto/sesión de la ruta actual se deriva internamente con `usePathname()` (sin plumbing desde las páginas).

Estado interno:

- `openProject: string | null` — el proyecto expandido (exclusividad).
- `sessionsMap: Record<string, Session[]>` + `loadingProject: string | null` — lazy-load de sesiones al expandir (mismo patrón que `CodingAgentExplorer` actual).
- Efecto sobre `usePathname()`: si la ruta coincide con `/agent/code/{project}/...`, `setOpenProject(project)`. Toggle manual lo sobrescribe hasta la siguiente navegación a una sesión.

Render por proyecto:

- Fila: `Item` con el nombre del proyecto + botón `+` (lucide `Plus`/`CirclePlus` con `aria-label="New session in <project>"`). Highlight (`Item active`) si `currentProject === proyecto`.
- Colapsado: reutiliza `useCollapse` de `react-collapsed` (patrón de `project-list-item.tsx`) con chevron rotatorio.
- Contenido expandido: sesiones (`getCodingAgentSessions(project, 10)`), cada una como `ChatLink` a `/agent/code/<project>/<sessionId>` con label `label ?? sessionId`, highlight si coincide project + sessionId. Estado de carga ("Loading sessions..."), empty state ("No sessions yet").

### 2. Sidebar — `components/layout/sidebar/sidebar.tsx` (modificar)

- Se elimina `<AgentCodeNav/>` y se inserta la sección en su lugar (tras RAGNav, antes de la sección Projects).
- Se fetchean los proyectos server-side si `config.codingAgentEnabled()` con `getCodingAgentProjects()`, dentro de un `Suspense` con skeleton (patrón de `ProjectList`/`ProjectListLoading`) y se pasan como props a la sección.
- Si el feature está deshabilitado, la sección no se renderiza (como hacía `AgentCodeNav`).
- El proyecto/sesión de ruta actual se deriva dentro de la sección con `usePathname()`; la sidebar no necesita props extra.

### 3. Data/actions

- `getCodingAgentSessions(project)` en `lib/features/code/actions.ts` gana un parámetro opcional `{ limit }` (o `limit?: number`), propagado a `listSessions` en `session-store.ts` como SQL `LIMIT`. Sin límite por defecto (compatibilidad con otros consumidores, p. ej. tests).
- `getCodingAgentProjects()` y `createCodingAgentSession(project)` sin cambios.

### 4. Eliminaciones

- `app/(chat)/agent/code/page.tsx` → se **borra el archivo** y Next devuelve 404 natural para `/agent/code` (no se usa `notFound()` explícito; la ruta simplemente deja de existir). Verificar que no haya links internos a `/agent/code` (auditoría previa: no los hay; todos apuntan a `/agent/code/{project}/...`).
- `components/code/coding-agent-explorer.tsx` → eliminar (y su skeleton/loading si existe como componente aparte).
- `components/layout/sidebar/agent-code-nav.tsx` → eliminar.

## Manejo de errores

- `getCodingAgentProjects()` devuelve `[]` si el root no existe (ya manejado) → la sección se muestra vacía o no se muestra. Se muestra la sección con título y sin items (consistente con el valor de vuelta de la action).
- Fallo al cargar sesiones de un proyecto (error de la server action): mostrar estado de error mínimo en el collapsible ("No se pudieron cargar las sesiones"). Sin reintento automático; el toggle del collapsible re-triggerea el fetch bajo demanda.
- Proyecto con 0 sesiones: "No sessions yet" (misma copia que el explorer) + botón `+` disponible para crear la primera.
- Sesión recién creada con label `null`: no aparece en la lista hasta tener label (`listSessions` filtra `isNotNull(label)`) — mismo comportamiento que el explorer actual; el usuario es navegado a la sesión recién creada de inmediato.

## Edge cases

- **Deep link directo** `/agent/code/p/s` → sección abierta en `p` con `s` highlighted; el resto colapsado.
- **Navegar entre proyectos** (s1 de p1 → s2 de p2) → se cierra p1, se abre p2, highlight en p2/s2.
- **Toggle manual mientras se navega**: el click a una sesión navega (ruta manda); el click al proyecto expande/colapsa sin navegar (estado manual manda). Al volver a navegar a una sesión, la ruta vuelve a mandar.
- **Rutas no-coding** (`/chat`, `/rag`, `/project/...`) → nada abierto, ningún highlight.
- **Subagente** `/agent/code/p/s/subagent/x` → se trata como la sesión `s` (highlight en p y s).
- **Sidebar cerrada (ancho 0)**: el componente sigue montado (patrón actual); el efecto de pathname corre igual, sin impacto visual.
- **Feature deshabilitado** (`config.codingAgentEnabled() === false`) → sección no renderizada.

## Testing (tests de componente, patrón `tests/component/agent-code/`)

- **Nueva sección** (`agent-code-section`):
  - Renderiza proyectos recibidos por props.
  - Expandir un proyecto abre su lista de sesiones (mock de `getCodingAgentSessions`); expandir otro cierra el primero (exclusividad).
  - Highlight: fila de proyecto activa según `currentProject`; fila de sesión activa según `currentProject + currentSessionId`.
  - Lista de sesiones limitada a 10 (el mock devuelve más; se verifica el slice/limit).
  - Botón `+` invoca la action mockeada y navega a la sesión creada (`router.push` + `useRouter` mockeado).
  - Empty state y estado de carga.
  - Feature deshabilitado → no renderiza.
- **E2E** (`tests/e2e/agent-code/agent-code.spec.ts`):
  - Ya no se visita `/agent/code`; el test crea la sesión vía la sección del sidebar (abrir sidebar → abrir proyecto → `+`), o navega directamente a una URL de sesión creada vía fixture/API. Verificar flujo de envío de mensaje desde la ruta de sesión.
  - Verificar que `/agent/code` devuelve 404.
- Se ajustan/borran tests que referencien `CodingAgentExplorer` o la landing (auditoría previa: ninguno salvo el e2e citado y el propio componente).

## Alcance

- Cambios solo en `packages/chatbot` (components, app, lib/features/code, tests). Sin cambios en `coding-agent`, `config` ni `models`.
- No se añade paginación "show more" ni vista de sesiones completa fuera del límite de 10 (fuera de MVP; el header del chat ya tiene su botón de nueva sesión y el file browser el markdown-to-session).
- No se modifica el comportamiento del chat ni del file browser.