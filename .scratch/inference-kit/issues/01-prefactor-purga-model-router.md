# 01: Prefactor — purga del Model Router muerto y tipado del registro de proveedores

**What to build:** el chatbot compila y pasa todas las suites exactamente igual que hoy, pero la feature `foundation-model` ya no depende de nada por encima de ella (sin ciclo con los tipos del chat), el código del Model Router retirado ha desaparecido, y el registro de proveedores está tipado a partir de `ProviderKind` del Model Catalog, de forma que un kind muerto o uno nuevo sin cliente sea error de compilación.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Eliminados el módulo del Model Router deprecado, sus prompts de clasificación (categorías, complejidad, decisión de tools) y los tipos asociados (`CATEGORIES`, `COMPLEXITY_LEVELS`, `ModelRoutingMetadata`, `ModelRoutingArguments`, `ModelRoutingResult`). Ninguna referencia queda en código ni tests.
- [ ] La feature `foundation-model` no importa nada de `lib/features/chat`; el ciclo feature ↔ foundation desaparece (verificable con una búsqueda de imports).
- [ ] La interfaz de proveedores de lenguaje se tipa como `Record<ProviderKind, (modelId) => LanguageModelV3>` derivado de `models`; las entradas sin kind en el catálogo (`anthropic`, `google`, `deepseek` como proveedores de lenguaje) se eliminan de la interfaz, de la implementación real y del modo test. Embedding y rerank siguen donde están por ahora.
- [ ] Sin cambios de comportamiento: `pnpm verify:fast` en verde y `pnpm build:verify` compila (nunca `build`).
- [ ] La entrada *Model Router* del glosario en `CONTEXT.md` queda marcada como legado (el término ya no describe código vivo).

## Comments
