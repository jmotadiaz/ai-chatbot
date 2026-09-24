# 08: ADR del Inference Kit y términos del glosario

**What to build:** la decisión arquitectónica queda registrada como ADR en `docs/adr/` (siguiente número libre) y el glosario de `CONTEXT.md` incorpora los términos nuevos, de modo que una sesión futura que toque proveedores, catálogo o decisiones encuentre la regla de dependencia y su porqué sin leer el historial.

**Blocked by:** 07 (estado final implementado).

**Status:** ready-for-agent

- [ ] ADR nuevo: contexto (catálogo extraído pero inferencia repartida en tres capas; decision acoplada al Chat Mode Router), decisión (paquete servidor `inference` como fachada fina sobre el AI SDK; `models` permanece datos isomorfos; Pi fuera por construcción; alias de capacidad fuera del paquete con test de invariantes), alternativas descartadas (crecer `models`, anticorrupción completa, modelos sintéticos de test, resolución de alias por predicado o por rol) y consecuencias (versión única de `ai`, regla de lint, runtime Node, worker importa pero no consume todavía). Referencia al spec y a la página de revisión.
- [ ] `CONTEXT.md`: entradas para *Inference Kit*, *Endpoint Kind* (semántica de `ProviderKind`), *Model Role*, *Capability Alias* y *Decision*, con sus `Avoid`; la entrada *Model Router* se retira o se marca como legado; *Model Catalog* menciona los catálogos por operación y los roles.
- [ ] Los ADR existentes no se modifican; el nuevo declara explícitamente que no contradice ADR 0002 ni ADR 0006.

## Comments
