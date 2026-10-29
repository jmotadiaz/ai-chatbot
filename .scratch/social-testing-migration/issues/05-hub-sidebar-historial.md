# 05: Migrar Hub, sidebar e historial

**What to build:** Comprobar las reglas de Hub, sidebar e historial en
fronteras sociales y conservar en navegador solo las garantías que realmente
dependan de él.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** ready-for-agent

- [ ] Se inventarían los tests activos y omitidos de estas capacidades y se identifica para cada garantía la frontera y los recursos adecuados.
- [ ] Se crean o demuestran reemplazos sociales equivalentes antes de retirar cualquier E2E activo de reglas de Hub, sidebar o historial.
- [ ] Se conserva y justifica cualquier garantía distinta de navegación, layout o viewport que requiera navegador; el scroll infinito se evalúa separando reglas de datos de geometría real.
- [ ] Cada E2E conservado explica qué comportamiento de navegador verifica y qué omitiría un test unitario.
- [ ] Se registran decisiones, equivalencias y casos omitidos en los comentarios; se consulta al operador ante garantías funcionales dudosas y se ejecutan las pruebas afectadas.

## Evidence

The added social tests retain distinct risks:

| Test | Guarantee | Substitutions |
| --- | --- | --- |
| `tests/unit/chat/history/history-chats.test.ts` | Root-only history, user isolation, ordering, search, pagination and session-bound action limits. | PGlite and auth boundary. |
| `tests/unit/chat/sidebar/sidebar-chats-and-pin.test.ts` | Sidebar ordering and pin changes without changing recency; unauthorized no-op. | PGlite, auth and revalidation. |
| `tests/unit/chat/hub/persist-hub-chat.test.ts` | Root chat and ordered transcript persistence, unauthorized rejection. | PGlite, auth and title generation. |
| `tests/unit/chat/hub/use-chat-hub.test.tsx` | Instance limit, locking and fan-out, empty input, persisted deletion and in-flight persistence. | jsdom, real catalog provider, substituted actions. |

Focused history/chat tests passed 109 before adding the hook; the Hub tests
passed seven and the profile selection contract passed three afterward. Lint and
type-check passed in this worktree.

The browser scenarios are retained pending individual equivalence review and
execution: Hub exercises responsive grid, simultaneous streaming, selection,
limit visibility and offline UI; Hub/sidebar integration exercises sidebar
updates; sidebar and history cover navigation, layout, deletion, ordering,
search, pinning and real infinite-scroll geometry. The navigation fixmes belong
to ticket 07. Some Hub assertions use conditional visibility and a broad
offline error match; these do not establish stronger guarantees than asserted.
No affected E2E was executed for this ticket.

## Per-case browser review

All cases remain active pending equivalence review and execution.

| Area | Case | Browser risk beyond social tests |
| --- | --- | --- |
| Hub | Three-model limit | Picker visibility at the limit. |
| Hub | Multi-model messaging and locking | Parallel streamed responses rendered in separate panels. |
| Hub | Select persisted chat | Button-to-server-action wiring and resulting UI. |
| Hub | Responsive grid | Real viewport geometry; conditional assertions limit this guarantee. |
| Hub | Offline | Browser network state and error UI; the error assertion is broad. |
| Hub/sidebar | Sidebar update after save | Cross-component refresh in the drawer. |
| Sidebar | Navigate between chats | Browser routing and lifecycle. |
| Sidebar | Display list, pinned order | Rendered data and order; data rules have social coverage. |
| Sidebar | Toggle visibility | Layout and visibility. |
| Sidebar | Delete | Browser interaction and confirmation. |
| History | Navigate | Sidebar-to-history routing. |
| History | Display and filter | Input wiring and rendered results; query rules have social coverage. |
| History | Infinite scroll | Real scrolling and sentinel geometry. |
| History | Cancel and confirm delete | Modal interaction and removal. |
| History | Pin ordering and updatedAt | Rendered order; persistence and ordering have social coverage. |
| History | Trash enabled while pinning | DOM control state. |

No owned component, integration or contract suite was found outside unit.
The conditional responsive assertions and offline error text warrant further
investigation; they should not be treated as stronger guarantees than asserted.
