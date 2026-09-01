# Deepening del Coding Agent Worker

Spec de esfuerzo: tres candidatos de la revisión de arquitectura del 2026-09-01
sobre `packages/coding-agent`, cada uno con su propio issue y grilling loop.

**Reporte publicado (fuente de la evidencia visual):**
http://192.168.18.50:3015/artifacts/ai-chatbot/architecture-review-20260901-083232-2c03c63d.html

## Contexto

`src/session-manager.ts` es el hot spot del paquete: 1816 líneas, 26 exports,
45 de los últimos 150 commits lo tocan. La revisión exploró el paquete con tres
subagentes (lifecycle, pipeline de eventos, wiring de extensiones/prompts) y
produjo 5 candidatos; este esfuerzo cubre los 3 priorizados:

| Issue | Candidato | Fuerza | Categoría |
|---|---|---|---|
| `issues/01-decompose-session-manager.md` | Descomponer el god module | Strong | in-process |
| `issues/02-unify-event-streamers.md` | Replay detrás del seam de `SessionEventLog` | Strong | in-process |
| `issues/03-agui-event-module.md` | Conocimiento AG-UI en un module tipado | Worth exploring | in-process |

Los dos candidatos no priorizados (un `SessionResources` module para
`pi-packages.ts`; reificar el seam extensión↔worker de `globalThis`) quedan
registrados en el reporte pero fuera de este esfuerzo.

## Dependencias entre issues

- **02 es la primera extracción natural de 01** (el streaming vive dentro del
  futuro `TurnRunner`). Se pueden abordar en cualquier orden, pero si 01 va
  primero, 02 debe entrar como parte de `TurnRunner`; si 02 va primero, 01 lo
  absorbe después sin rehacerlo.
- **03 hace a 02 más seguro**: los helpers de clasificación (`deltaKey`,
  `isTerminal`, la máquina de estados del prelude) son lo que la compaction y el
  prelude consumen cuando pasan a ser implementación privada del event log.

## Vocabulario

- Arquitectura: el glossary de la skill `codebase-design` (module, interface,
  implementation, depth, deep, shallow, seam, adapter, leverage, locality,
  deletion test). Usarlo exactamente; no derivar a "component", "service",
  "API", "boundary", "wrapper".
- Dominio: `CONTEXT.md` (Coding Agent Worker, Coding Agent Session, Turn,
  Subagent, Subagent Bridge, Skill, Prompty, Repository).

## Flujo por issue

1. Sesión nueva: leer el issue → invocar la skill `grilling` con el usuario.
2. Durante el grilling: side effects inline vía la skill `domain-modeling`
   (término nuevo → `CONTEXT.md`; razón load-bearing para descartar → ofrecer
   ADR en `docs/adr/`, que hoy no existe).
3. Alternativas de interface: patrón design-it-twice de `codebase-design`
   (subagentes paralelos).
4. Al cerrar el grilling: actualizar `Status:` del issue y registrar la
   decisión en `## Comments`.
