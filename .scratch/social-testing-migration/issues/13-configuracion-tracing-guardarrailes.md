# 13: Migrar configuración, tracing y guardarraíles

**What to build:** Mantener garantías comprobables de configuración, tracing
y arquitectura, concentrando los Environment Guardrails en los riesgos que
protegen realmente.

**Blocked by:** 01: Preparar la transición y migrar Compaction.

**Status:** ready-for-agent

- [x] Se inventarían y migran los tests de configuración, tracing y comprobaciones arquitectónicas y de scripts, conservando sus garantías significativas.
- [x] Los Environment Guardrails cubren aislamiento de Environments y protección de datos y artefactos de Production; se retiran las aserciones históricas de scripts de build fuera de ese alcance.
- [x] No se añaden automáticamente reemplazos para esas aserciones; se consulta al operador antes de añadir uno por un riesgo operativo demostrado.
- [x] Cada función de aptitud arquitectónica retenida identifica característica, criterio objetivo y ejecución; se distingue probar la regla de ejecutarla sobre el código.
- [x] Se registran garantías, eliminaciones y excepciones en los comentarios y se ejecutan las comprobaciones afectadas sin alterar Production.

## Evidence

Configuration tests retain Environment bundles, argument selection and portable
paths. Build and preview guardrails retain Environment selection, the Production
gate, migration ordering and isolated verification outputs. Historical
script-name absence checks were removed without replacement.

The moved tests are under `tests/unit/config`, `tests/unit/scripts`,
`tests/unit/tracing` and `tests/unit/architecture` in the relevant packages.

| Suites | Retained guarantee |
| --- | --- |
| `config/tests/unit/{env-bundles,argv,paths}.test.ts` | Frozen Environment bundles, argument selection and portable paths. |
| chatbot `tests/unit/scripts/{build-scripts,prod-build-gate}.test.ts` | Build and preview gates, migration ordering and isolated outputs. |
| chatbot `tests/unit/config/{next-config-env-alias,next-config-distdir,next-internals,e2e-global-setup-guardrail}.test.ts` | Bundler binding and output isolation, launcher compatibility and test DB guard. |
| chatbot `tests/unit/architecture/{eslint-boundaries,test-profile-selection}.test.ts` | AI import boundaries and complete test discovery. |
| chatbot `tests/unit/tracing/trace-sink-registry.test.ts` | Shared trace sink lifecycle. |
| Worker `tests/unit/scripts/{build-scripts,prod-build-gate}.test.ts` | Build gate, isolated output and Production serving safeguards. |
| Worker `tests/unit/architecture/no-process-env-mutations.test.ts` | Test Environment isolation. |

Removed without replacement: historical assertions that obsolete `start`,
`build:dev`, `build:prod`, `build:worker`, `worker:dev`, `mcp-server` and
`transport:http` scripts or references are absent, and unrelated checks for
`generate-models`, `MODEL_GATEWAY` or `coding-agent` strings in scripts.
Environment and Production safeguards, including dotenv bans and the explicit
Production build gate, remain. Gateway dirty-tree guard coverage is ticket 12;
client bundle inspection is ticket 02.

| Fitness characteristic | Objective criterion | Execution |
| --- | --- | --- |
| Client/server AI boundaries | Client files cannot import the AI composition root; SDK imports are restricted to permitted layers. | ESLint rule tests use synthetic files; `pnpm lint` checks the real repository. |
| Test Environment isolation | Tests must not mutate Worker/Gateway environment selectors or target `.pi-prod`/`.pi-dev`. | `no-process-env-mutations.test.ts` scans the real test tree. |
| Test profile completeness | Every chatbot test file belongs to exactly one profile. | `test-profile-selection.test.ts` checks actual discovery. |
| Bundler Environment binding | Both bundlers resolve `config` to the active Environment without reading argv. | `next-config-env-alias.test.ts` inspects the actual Next configuration. |

Post-edit validation: root lint and type-check passed; isolated `build:verify`
passed for chatbot and Worker. Chatbot unit: 478 tests; Worker unit: 253 tests;
config unit: 30 tests. Contract suites passed; the bundle check ran after
the isolated build using fake worktree secrets, not Production credentials.
The Model Gateway Python suite and E2E were not run for this ticket.
