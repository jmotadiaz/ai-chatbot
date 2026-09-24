# 03: Mocks en `inference/testing` y alias de capacidad con invariantes

**What to build:** los constructores de mock del AI SDK (modelo genérico, embeddings, streams y los cinco comportamientos: ejecución de tools, visión, razonamiento, rechazo, error a mitad de stream) viven en el subpath `inference/testing`, sin ningún id de modelo. La tabla de alias de capacidad se queda en los tests del chatbot, tipada con `InvocableModelId` de `models`, y cada alias declara lo que su mock asume del Model Catalog. Un test unitario nuevo falla, nombrando el alias y la propiedad, cuando el catálogo deja de cumplirlo. La suite e2e pasa sin cambios en los specs.

**Blocked by:** 02 (kit con inyección de `languageModel` por entrada de catálogo).

**Status:** ready-for-agent

- [ ] `inference/testing` exporta `createMockModel`, `createMockEmbeddingModel`, los helpers de stream y los cinco comportamientos como `MockModelEntry` sin id; el paquete principal no importa nada de `testing`.
- [ ] `CAPABILITY_ALIASES` permanece en los tests del chatbot, con `satisfies` sobre `InvocableModelId` de `models`; cada alias pasa a `{ id, requires }` donde `requires` declara lo que el mock asume: entrada de imagen (`canSeeImages`), razonamiento (`canProduceReasoning`), temperatura distinta de otro alias (`alwaysRefuses` vs `basicChat`), mock genérico obligatorio (`basicChat`, `basicChatAlt`).
- [ ] La composición raíz de test del chatbot construye el resolutor `entrada de catálogo → alias → comportamiento` a partir de esa tabla y los constructores del paquete; el registro por id de catálogo del ticket 02 desaparece.
- [ ] Test unitario de invariantes de alias: por cada alias, la entrada del catálogo cumple `requires`; los alias apuntan a modelos distintos; los alias de mock genérico no tienen comportamiento asociado. El mensaje de fallo nombra alias y propiedad incumplida.
- [ ] Los helpers de e2e (selector de modelo, cabecera del hub) siguen resolviendo alias → nombre de modelo sin cambios de API para los specs.
- [ ] `tests/AGENTS.md` del chatbot actualizado: dónde viven los constructores, cómo se añade un alias con `requires`, qué comprueba el test de invariantes.
- [ ] `pnpm verify:fast` y `pnpm test:e2e` en verde.

## Comments
