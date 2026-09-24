# 08: ADR del Inference Kit y términos del glosario

**What to build:** la decisión arquitectónica queda registrada como ADR en `docs/adr/` (siguiente número libre) y el glosario de `CONTEXT.md` incorpora los términos nuevos, de modo que una sesión futura que toque proveedores, catálogo o decisiones encuentre la regla de dependencia y su porqué sin leer el historial.

**Blocked by:** 07 (estado final implementado).

**Status:** ready-for-agent

- [x] ADR nuevo: contexto (catálogo extraído pero inferencia repartida en tres capas; decision acoplada al Chat Mode Router), decisión (paquete servidor `inference` como fachada fina sobre el AI SDK; `models` permanece datos isomorfos; Pi fuera por construcción; alias de capacidad fuera del paquete con test de invariantes), alternativas descartadas (crecer `models`, anticorrupción completa, modelos sintéticos de test, resolución de alias por predicado o por rol) y consecuencias (versión única de `ai`, regla de lint, runtime Node, worker importa pero no consume todavía). Referencia al spec y a la página de revisión.
- [x] `CONTEXT.md`: entradas para *Inference Kit*, *Endpoint Kind* (semántica de `ProviderKind`), *Model Role*, *Capability Alias* y *Decision*, con sus `Avoid`; la entrada *Model Router* se retira o se marca como legado; *Model Catalog* menciona los catálogos por operación y los roles.
- [x] Los ADR existentes no se modifican; el nuevo declara explícitamente que no contradice ADR 0002 ni ADR 0006.

## Comments

### 2026-09-24 — merged

Merge commit: `aff7d03a` (`merge: ticket 08 — Inference Kit ADR and glossary terms`, into `feat/inference-kit`). No conflicts — 08 branched from ticket 07's implementer tip (`31466147`); the integration branch had only gained ticket 07's merge (`143e53c6`) and closing commit (`ed9f6d0f`) since, as expected. Implementer commit merged: `e3d8d671` ("docs: record the Inference Kit as ADR 0008 and glossary terms").

**Verified in the integration worktree:** `pnpm verify:fast` green — lint + type:check across all 6 workspace projects and every fast test suite (unit/component/integration/contract, 121 test files, all passed; exit 0). ADR numbering: `docs/adr/` ran 0001–0007 before this merge, so `0008-inference-kit-fachada-sobre-ai-sdk.md` is the next free number. Existing ADRs untouched: `git diff main...HEAD --stat -- docs/adr/` shows only the new 0008 file across the whole effort (144 insertions, 0 deletions elsewhere). The ADR's "Consecuencias" section states explicitly that it does not contradict ADR 0002 (Pi runtime aislado) nor ADR 0006 (build exclusivo de producción). `CONTEXT.md` gained the *Inferencia (Inference Kit)* subsection with all five requested entries (*Inference Kit*, *Endpoint Kind*, *Model Role*, *Decision*, *Capability Alias*), each with an `_Avoid_` line, and *Model Catalog* now mentions the per-operation catalogs and Model Role maps. *Model Router* stays marked as legacy (`_(legado)_`) rather than being retired, because `ModelRoutingMetadata`/`MessageMetadata.autoModel` still decode `Message.metadata.autoModel` persisted by chats before the mechanism was removed.
