# Spec: Purga de skills y eliminación de superpowers

**Status:** ready-for-agent

## Problem Statement

El catálogo de skills de operador (`.agents/skills/`, 40 skills) ha crecido por encima de lo que este repo realmente usa, y con él, ruido. Conviven skills que solo tienen sentido en Claude Code o en un repo-curso, un trío de escritura de artículos, y ocho skills que upstream todavía marca como `in-progress`. Ese ruido tiene coste medible: 18 skills son *model-invoked* y sus descripciones viven en el prompt de sistema de cada sesión (~1.200 tokens permanentes), y el resto compite por atención en el catálogo, hasta el punto de no saber cuáles son útiles por no haber podido usarlas.

Además hay dos duplicaciones y un cadáver:

- El `AGENTS.md` raíz incrusta el procedimiento completo de Context7 (~4.700 bytes permanentes) que ya vive en el skill `find-docs`, cargado on-demand. El *cuándo* queda cubierto por la descripción del skill.
- La extensión superpowers (13 skills + extensión TS + instrumentación del bootstrap + 4 tests) sigue en el repo **deshabilitada globalmente**. Su bootstrap se instrumenta en el runtime, se documenta en dos `AGENTS.md` y se referencia desde `trace-analyzer`, que hoy apunta a una skill que ya no se carga. Es código muerto mantenido por tests que dan por viva una feature inexistente.

El resultado: contexto permanente evitable, una guía duplicada que puede contradecirse, y una feature fantasma que se documenta, se testea y se traza sin ejecutarse nunca.

## Solution

Reducir el catálogo de operador a las herramientas que aplican a este repo, y eliminar todo rastro de superpowers.

- **Bajas por evidencia** (no pueden aplicar aquí, o ya están hechas): `git-guardrails-claude-code`, `setup-pre-commit` (el repo ya tiene un pre-commit más fuerte), `migrate-to-shoehorn` (shoehorn no existe en el repo) y `scaffold-exercises` (esto no es un curso). Es el lote que libera contexto permanente.
- **Bajas por decisión** (upstream `in-progress` y sin uso): `claude-handoff`, `loop-me`, `setup-ts-deep-modules`, `to-questionnaire` y el trío `writing-beats` / `writing-fragments` / `writing-shape`.
- **Se conservan** el flujo principal completo, `retro` (su primer candidato de mejora es justamente esta duplicación), `implement-spec`, `writing-for-agents` (dependencia de `retro` y guía de estilo de los propios agentes) y las utilidades de coste cero o casi cero: `teach`, `triage`, `wait-what`, `setup-matt-pocock-skills`, `prototype`, `diagnosing-bugs`, `resolving-merge-conflicts` y `wizard`.
- **`find-docs` se queda** con su descripción, y el procedimiento duplicado sale de `AGENTS.md`: una sola fuente, la del skill.
- **Superpowers se elimina entero**: extensión, skills, instrumentación del bootstrap en el runtime, tests dedicados, referencias en docs y harness, y el plugin de OpenCode. `trace-analyzer` se re-empareja con `diagnosing-bugs` para que su workflow deje de apuntar al vacío.
- **Coherencia posterior**: el lock de skills y la nota de vendoring de `AGENTS.md` pierden las entradas borradas, y el router `ask-matt` se limpia en último lugar para no nombrar skills que ya no existen.

El objetivo no es "borrar por no usar" — hay skills conservadas sin uso todavía — sino quitar lo que no puede aplicar, lo que está duplicado y lo que está muerto, para que el resto sea descubrible.

## User Stories

1. Como operador, quiero que el prompt de sistema de cada sesión cargue solo skills que aplican a este repo, para no gastar contexto en capacidades que aquí nunca voy a usar.
2. Como operador, quiero que un skill de Claude Code no pueda dispararse en una sesión de pi, para no perder un turno en una herramienta inerte.
3. Como operador, quiero que `AGENTS.md` no repita el procedimiento de un skill que ya existe, para que la guía viva en un único sitio y no haya dos copias que se contradigan.
4. Como operador, quiero que el *cuándo* de Context7 siga disponible en la descripción de `find-docs`, para no perder la capacidad al eliminar la copia de `AGENTS.md`.
5. Como operador, quiero que las skills de escritura, de curso y las `in-progress` que no uso no ocupen el catálogo, para poder descubrir las que sí me sirven.
6. Como operador, quiero conservar `retro`, para revisar una sesión y encontrar mejoras del entorno como esta misma duplicación.
7. Como operador, quiero conservar `implement-spec`, para disponer del modo de implementación paralela con subagentes.
8. Como operador, quiero que `trace-analyzer` funcione sin una skill que ya no se carga, para que su workflow de depuración no esté roto.
9. Como operador, quiero que `retro` conserve su guía de estilo (`writing-for-agents`), para que sus informes mantengan el formato.
10. Como operador, quiero que el repo no contenga la extensión superpowers, para no mantener una feature deshabilitada que solo genera deuda de documentación y tests.
11. Como operador, quiero que los tests del worker dejen de dar por viva la feature borrada, para que la suite mida solo comportamiento existente.
12. Como operador, quiero que la sesión de subagente siga sin heredar extensiones de orquestador, para que la anti-recursión siga garantizada estructuralmente.
13. Como operador, quiero que `skills-lock.json` no contenga las skills borradas, para que un re-sync no las resucite.
14. Como operador, quiero que `AGENTS.md` documente qué es bajo intencional y qué se ha parcheado, para que la próxima poda sepa distinguir decisión de olvido.
15. Como operador, quiero que `ask-matt` solo nombre skills que existen, para que el router no me envíe a ficheros fantasma.
16. Como operador, quiero conservar la historia del flujo antiguo renombrando `docs/superpowers/` a `docs/archive/`, para eliminar el espacio de nombres sin destruir documentos.
17. Como operador, quiero que las referencias a documentos movidos sigan resolviendo, para no dejar enlaces muertos.
18. Como operador, quiero que OpenCode deje de instalar superpowers, para que el rastro no sobreviva en otro harness.
19. Como operador, quiero que el estado de runtime huérfano de superpowers (brainstorm y sdd) desaparezca del disco, para no dejar 1,2 MB de basura gitignorada.
20. Como operador, quiero que la poda valga también para las sesiones del Coding Agent que trabajan sobre este repo —pi descubre `.agents/skills/` desde el `cwd`, así que el worker hereda el mismo catálogo—, para que mi sesión de operador y el worker no tengan dos verdades sobre qué skills existen.
21. Como operador, quiero que los skills de producto (`mobile-first-artifacts`, `writing-prompties`) no se toquen, para no alterar lo que despliega el worker.
22. Como operador, quiero que un prototipo de lógica entregue su HTML por el sistema de artefactos del harness en vez de un fichero que hay que abrir a mano, para leerlo en el navegador como el resto de informes.
23. Como operador, quiero que ese prototipo siga las reglas de `mobile-first-artifacts`, para que se lea bien desde el móvil.
24. Como operador, quiero que la purga no requiera tocar el servicio de producción, para no arriesgar downtime.
25. Como operador, quiero que cada ticket deje las suites rápidas en verde y verificables por sí solo, para poder implementarlos en ventanas de contexto frescas.

## Implementation Decisions

- **Criterio de poda**: un skill se borra cuando hay un hecho que lo justifica (no puede aplicar en este repo, ya está hecho, o es `in-progress` upstream y no se usa). No se borra por falta de uso: el usuario todavía no ha podido descubrir los conservados precisamente por el ruido. El ahorro de contexto solo se predica de los *model-invoked*.
- **Bajas model-invoked**: `git-guardrails-claude-code` (configura hooks de Claude Code; no hay `.claude/`), `setup-pre-commit` (bootstrapper que regresaría el hook actual: el repo ya corre lint-staged + `verify:fast`), `migrate-to-shoehorn` (shoehorn no aparece en ningún manifiesto ni test) y `scaffold-exercises` (este repo no es un curso).
- **Bajas user-invoked**: `claude-handoff` (requiere el CLI de Claude y duplica `handoff`), `loop-me`, `setup-ts-deep-modules` (no hay dependency-cruiser), `to-questionnaire` y el trío de escritura.
- **Conservadas**: flujo principal (`ask-matt`, `grill-me`, `grill-with-docs`, `grilling`, `domain-modeling`, `codebase-design`, `to-spec`, `to-tickets`, `wayfinder`, `improve-codebase-architecture`, `implement`, `implement-spec`, `tdd`, `code-review`, `handoff`, `research`, `archify`, `trace-analyzer`, `writing-for-agents`), más `retro`, `teach`, `triage`, `wait-what`, `setup-matt-pocock-skills`, `prototype`, `diagnosing-bugs`, `resolving-merge-conflicts` y `wizard`.
- **`find-docs`**: se queda con su descripción intacta; el bloque `context7` de `AGENTS.md` se elimina íntegro. El *cuándo* sigue en contexto porque la descripción del skill es *model-invoked*. `find-docs` y `trace-analyzer` no están en el lock (son locales), así que no requieren cirugía de lock.
- **Superpowers**: se elimina la extensión completa con sus skills; la opción de composición `includeSuperpowersExtension` desaparece del cargador de recursos y se simplifica a una única función de skills first-party; desaparece la instrumentación del bootstrap (wrapper de `transformContext`, marker, logs de trace `debug.superpowers_*`) y el campo de estado del bootstrap. La exclusión del subagente se mantiene como está: el flag de anti-recursión sigue gobernando la ausencia del tool `subagent` en sesiones hijas.
- **Tests**: se borran los dos ficheros dedicados a superpowers (extensión y bootstrap) y los tests de composición de rutas se actualizan al inventario actual: `subagent` es la única extensión first-party y las skills first-party se reducen al directorio built-in. Sin asserts negativos permanentes: la ausencia de rastros se comprueba una sola vez, con grep determinista, en el ticket final.
- **`trace-analyzer`**: su workflow de depuración se re-empareja con `diagnosing-bugs`, que ya es *model-invoked* y parte del flujo. La referencia al par antiguo se reescribe, no se borra la referencia al workflow.
- **`prototype`**: se parchea (es un skill vendored) para que su rama de lógica entregue el HTML por el sistema de artefactos del harness en vez de un fichero para abrir a mano, siguiendo las reglas de `mobile-first-artifacts`, y se anota en la sección de parches locales de `AGENTS.md` junto a `archify`, `improve-codebase-architecture` y `handoff`. El enlace vive en `prototype`: los skills de producto no se tocan.
- **Rastros externos**: el plugin de OpenCode se retira; el estado de runtime huérfano se borra y sus entradas de `.gitignore` se eliminan; `docs/superpowers/` se renombra a `docs/archive/` y la referencia del comentario de Playwright se actualiza. Los artefactos publicados y las trazas históricas se dejan: son salida generada, no rastro de código.
- **Coherencia**: el lock pierde las entradas de las skills borradas y la sección de skills vendored de `AGENTS.md` se actualiza para dejar constancia; `ask-matt` se limpia en la fase final, cuando ya se sabe qué sobrevive.
- **Sin cambios** de schema, contratos de API ni interfaces públicas del worker. La purga es de código fuente, skills y documentación; no requiere build ni restart de producción.
- **Sin nueva interfaz**: el único ajuste de interfaz es la eliminación de una opción y la fusión de dos funciones equivalentes del cargador.

## Testing Decisions

- **Un solo seam**: la composición de rutas del cargador de recursos del worker (`pi-packages`), que ya tiene cobertura en `tests/unit/pi-packages.test.ts` y `tests/integration/pi-extension-paths.test.ts`. Es el punto más alto por el que pasan extensiones y skills antes de llegar al SDK.
- **Qué hace bueno a un test aquí**: asertar rutas y estado observable del resource loader (qué extensiones y skills quedan cargadas), no detalles internos de la extensión.
- **Aserciones post-purga** (todas positivas, describen el sistema actual):
  - la única extensión first-party es `subagent`, y sus entrypoints siguen siendo ficheros;
  - `additionalSkillPaths` queda compuesto solo por el directorio de skills built-in (el subagente no aporta skills);
  - una sesión de subagente carga exactamente `mobile-first-artifacts` y `writing-prompties`.
- **Sin guard permanente**: no se añaden asserts que comprueben la ausencia de superpowers; serían tests al servicio de este desarrollo y no del sistema, y se quedarían para siempre. La ausencia se verifica una sola vez, con un grep determinista sobre el repo, en el ticket final: un chequeo efímero, no una aserción de suite.
- **`prototype` no lleva test**: es un parche de markdown. Su verificación es que el artefacto se publique y se pueda abrir desde el navegador.
- **Prior art**: los dos ficheros de test citados, más `tests/unit/session-manager-subagent.test.ts` para el comportamiento de exclusión del subagente.
- **Sin seam nuevo** para markdown y configuración de operador (`.agents/skills/`, `AGENTS.md`, lock, OpenCode, docs): no tienen runtime. Su verificación es grep de referencias colgantes más revisión, y una comprobación final de extremo a extremo de que no queda ningún rastro.
- **Verificación por ticket**: suites rápidas del repo en verde. Antes de commit, verificación de compilación aislada (`build:verify`); nunca el build de producción.

## Out of Scope

- Skills de producto del worker (`mobile-first-artifacts`, `writing-prompties`).
- Cualquier cambio en `packages/chatbot/`.
- Rehabilitar superpowers o sustituir sus skills de planificación.
- Limpieza de trazas históricas, artefactos publicados o de la instrumentación de tracing general.
- Despliegue, build de producción o restart del servicio supervisado por pm2.
- Cambios en el flujo de `triage` y sus etiquetas.

## Further Notes

- **Balance esperado**: ~213 tokens permanentes por las cuatro descripciones model-invoked y ~1.180 tokens por el bloque de Context7 de `AGENTS.md`; en total ~1.390 tokens permanentes menos, sin perder ninguna capacidad.
- El catálogo pasa de 40 skills a 29.
- `wizard` es el único skill conservado con coste apreciable (~78 token de descripción); se revisa tras usarlo una vez.
- Este esfuerzo es el primer candidato natural para `retro`: la duplicación de Context7 en `AGENTS.md` es exactamente el tipo de hallazgo que ese skill busca.
