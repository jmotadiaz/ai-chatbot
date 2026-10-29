# 08: Migrar Attachments, Prompt Refiner y recorrido básico

**What to build:** Probar los comportamientos de Attachments y Prompt
Refiner desde capacidades observables y conservar un recorrido básico de Chat
solo por la garantía adicional que aporte el navegador.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** ready-for-agent

- [ ] Se inventarían las garantías activas y omitidas de Attachments, Prompt Refiner y del recorrido básico.
- [ ] Las reglas de menú de adjuntos y refinado/deshacer se cubren socialmente cuando sea fiel; no se elimina un E2E activo antes de demostrar una cobertura equivalente.
- [ ] El recorrido representativo de Chat conservado identifica la garantía de ensamblaje con navegador y lo que omitiría un test unitario.
- [ ] Se trasladan y consolidan los tests no E2E correspondientes siguiendo el criterio social por defecto y se justifican las excepciones aisladas.
- [ ] Se registran las decisiones y equivalencias en los comentarios, se consultan las dudas funcionales y se ejecutan las pruebas afectadas.

## Evidence

- `tests/e2e/chat/attachments.spec.ts` exercises attachment menu capability
  rules and the file input; `refine.spec.ts` exercises a Refine request and
  Undo; `seed.spec.ts` is the candidate representative Chat journey. All are
  retained: browser-level equivalence has not been demonstrated.
- Social tests now live under `tests/unit`: `attachment/attachments-control`
  tests the real menu; `meta-prompt/prompt-refiner-hook` tests the real hook
  with fetch substituted; `meta-prompt/refine-prompt-route` tests the route
  with the Gateway harness; `chat/composer/chat-composer-wiring` connects the
  real providers, composer, hook and route with that harness. Browser APIs,
  authentication and routing are substituted as needed.
- The focused Vitest run passed 18 tests across five files; focused ESLint and
  chatbot type-check passed. A wider pre-move run passed 254 tests.
- Playwright was not run for this ticket. The representative journey's
  browser-only guarantee and execution remain to be documented. Infinite
  scroll and camera device geometry are not covered by the social tests.
