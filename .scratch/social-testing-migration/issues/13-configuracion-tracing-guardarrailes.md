# 13: Migrar configuración, tracing y guardarraíles

**What to build:** Mantener garantías comprobables de configuración, tracing
y arquitectura, concentrando los Environment Guardrails en los riesgos que
protegen realmente.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** ready-for-agent

- [ ] Se inventarían y migran los tests de configuración, tracing y comprobaciones arquitectónicas y de scripts, conservando sus garantías significativas.
- [ ] Los Environment Guardrails cubren aislamiento de Environments y protección de datos y artefactos de Production; se retiran las aserciones históricas de scripts de build fuera de ese alcance.
- [ ] No se añaden automáticamente reemplazos para esas aserciones; se consulta al operador antes de añadir uno por un riesgo operativo demostrado.
- [ ] Cada función de aptitud arquitectónica retenida identifica característica, criterio objetivo y ejecución; se distingue probar la regla de ejecutarla sobre el código.
- [ ] Se registran garantías, eliminaciones y excepciones en los comentarios y se ejecutan las comprobaciones afectadas sin alterar Production.

## Evidence

Configuration tests retain Environment bundles, argument selection and portable
paths. Build and preview guardrails retain Environment selection, the Production
gate, migration ordering and isolated verification outputs. Historical
script-name absence checks were removed without replacement.

The moved tests are under `tests/unit/config`, `tests/unit/scripts`,
`tests/unit/tracing` and `tests/unit/architecture` in the relevant packages.

| Fitness characteristic | Objective criterion | Execution |
| --- | --- | --- |
| Client/server AI boundaries | Client files cannot import the AI composition root; SDK imports are restricted to permitted layers. | ESLint rule tests use synthetic files; `pnpm lint` checks the real repository. |
| Test Environment isolation | Tests must not mutate Worker/Gateway environment selectors or target `.pi-prod`/`.pi-dev`. | `no-process-env-mutations.test.ts` scans the real test tree. |
| Test profile completeness | Every chatbot test file belongs to exactly one profile. | `test-profile-selection.test.ts` checks actual discovery. |
| Bundler Environment binding | Both bundlers resolve `config` to the active Environment without reading argv. | `next-config-env-alias.test.ts` inspects the actual Next configuration. |

Post-edit validation: root lint and type-check passed; isolated `build:verify`
passed for chatbot and Worker. Chatbot unit: 478 tests; Worker unit: 253 tests;
config unit: 30 tests. Contract suites also passed with one bundle check skipped.
The Model Gateway Python suite and E2E were not run for this ticket.
