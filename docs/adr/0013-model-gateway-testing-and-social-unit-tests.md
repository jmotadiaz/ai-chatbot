---
status: accepted
date: 2026-10-28
---

# Test concrete feature modules at the Model Gateway HTTP seam

The Model Gateway centralizes provider integration, but chatbot features still
contain AI ports, adapter objects, and factories used to inject test doubles.
We will consolidate those features into concrete modules and substitute inference
at the Gateway HTTP seam. Feature interfaces remain small; prompts, validation,
model selection, transformations, and persistence remain inside their owning
modules. We will not replace the removed ports with another generic AI port.

## Dependency categories

We use the categories from
[Deepening](../../.agents/skills/codebase-design/DEEPENING.md):

| Dependency, from the consumer's perspective | Category | Testing strategy |
|---|---|---|
| Feature persistence | Local-substitutable | Use PGlite (`setupTestDb`) in social unit tests, and isolated PostgreSQL test resources when a test requires external database infrastructure or E2E assembly. Do not introduce repository ports solely to inject fakes. |
| Model Gateway, from chatbot and Coding Agent Worker | Remote but owned | Retain the production inference integration and substitute Gateway HTTP responses. |
| Upstream providers, from Model Gateway | True external | Keep provider adaptation and provider-specific tests inside the Gateway's responsibility. |

Social unit tests that touch persistence run in-process against PGlite (`setupTestDb` with `pgvector`), remaining self-contained without requiring a running PostgreSQL container. Tests that explicitly require external PostgreSQL infrastructure or E2E assembly use isolated test data rather than global destructive cleanup across shared resources.

For the Gateway, we deliberately depart from Deepening's suggested combination
of an injected in-memory adapter for tests and an HTTP adapter for production.
The existing production integration remains in use; MSW intercepts requests in
social unit tests, and an HTTP server provides deterministic responses to E2E
tests. This exercises SDK serialization and response interpretation without
maintaining an injectable AI implementation in each feature.

## Official testing tools, consumer-owned scenarios

An official JavaScript package associated with the Model Gateway will provide
reusable protocol fixtures, configurable response construction, request recording,
MSW handlers, and an HTTP server integration sharing the same behavior.
It will not initially provide a production client or depend on a test runner.

Consumers own their test catalogs and application-specific scenarios. Chatbot
E2E registers its model-scenario definitions at startup; social unit tests
configure responses explicitly per test. Shared definitions must not introduce
global response queues, execution counters, or resets affecting other tests.
There is no general remote scenario-configuration API in the initial design.

This amends the testing-tool ownership described in
[ADR 0010](./0010-model-gateway-desacoplado.md): reusable protocol mechanisms move
to the official package, while test capability catalogs and application behavior
remain consumer-owned. It does not supersede the Gateway's independent Python
runtime, provider credential ownership, or Environment isolation.

## Feature and test migration

The target categories are **unit tests**, including social unit tests, and
**E2E tests**. A unit test exercises a unit of behavior with its collaborators
under controlled conditions, without a real browser. It may use PGlite, MSW,
temporary files, local subprocesses, or a test-owned HTTP server when those
collaborators are necessary to verify the behavior. A socket or subprocess alone
does not make it a separate category. Contract tests and rendered-component
tests without a real browser are unit tests; their purpose remains identifiable.

The default unit profile is self-contained: it may create and clean up its own
local resources, but does not require a provisioned PostgreSQL server or other
pre-existing service. Tests requiring provisioned infrastructure are
selectable through an explicit profile, included in full verification. Tests
using shared resources must isolate their data and avoid global destructive
cleanup.

The target layout uses `tests/unit` and `tests/e2e` within each package, with
unit tests organized by feature or responsibility. The target unit command
covers all packages, including the Model Gateway's Python tests; tests remain
selectable by package or file. The current directories and commands remain in
effect until the migration is implemented.

### Social unit tests by default

Design unit tests around meaningful behavior rather than around individual
functions or files. A behavior can be a user-facing use case or a technical
capability, contract, or guardrail with an identified risk. Prefer the
capability's stable interface closest to the guarantee being tested; entering
through a UI or HTTP route is not required for every scenario. Test the
connection to a more external entry point when it provides a distinct guarantee.

Use real first-party collaborators by default, substituting external
dependencies and resources that require control. An internal double is an
exception when the real collaborator makes the test impractical or
disproportionately costly; identify the guarantee the double leaves untested.
Prefer observable results, persisted state, errors, and external-boundary
contracts over assertions about internal calls or their order, unless those
interactions themselves protect a meaningful guarantee.

Prefer the complete capability's interface over a social test of an internal
subcapability. Retain the narrower boundary when it has its own reusable
contract or the broader test would be significantly more costly or fragile.
Isolated tests remain appropriate for significant rules, boundaries, or
invariants that are difficult, fragile, or disproportionately costly to verify
socially.

Consolidate by guarantee and risk, not by file or test count. Keep separate
scenarios for distinct guarantees or failure modes; use tables for variants of
the same rule where appropriate. Additional test boundaries must cover a
distinct risk to justify their cost. Internal details without independent value
may be removed; consult the operator when a functional guarantee may be lost or
the expected behavior is unclear. Fewer tests may result, but are not a quota.

### Unit by default; E2E when a browser is essential

E2E is reserved for tests whose guarantee requires a real browser and cannot
be verified faithfully by a unit or social unit test. Using Playwright, rendering
UI, clicking an element, or opening a browser is not sufficient by itself.
Relevant browser behavior includes:

1. **Geometry and viewport:** real layout, viewport intersection, scrolling,
   or responsive behavior when simulated DOM behavior would omit the guarantee.
2. **Navigation and lifecycle:** actual routing, redirects, deep links, history,
   reload, or leaving and returning to a screen, where the browser's behavior is
   the risk being checked.
3. **Browser-application interaction:** session cookies and redirects, stream
   disconnection and reconnection, or client recovery while server work
   continues. Streaming alone does not require E2E.
4. **Representative critical journeys:** browser-side assembly of the client
   with routing, middleware, server behavior, persistence, and a visible result,
   when that browser assembly contributes a distinct guarantee. Keep
   representative journeys, not a matrix of inputs or inference responses.

Every E2E must state: "This test needs a real browser because it verifies ___;
a unit test would omit ___." Keep only distinct browser risks at E2E scope;
exercise rules and variants without a browser when they can be verified
faithfully there. An existing guarantee stays covered while equivalence is
being established. Multiple modules, PostgreSQL, controlled HTTP, tool calls,
or business importance alone do not justify E2E.

### Purpose, resources, and quality evaluations

Test category, purpose, and execution resources are independent. An
**Architectural Fitness Function** objectively assesses a named architectural
characteristic with an explicit acceptance criterion. It may be a static
check, an executable test, a metric, or another assessment; not every contract
or static assertion qualifies. Its characteristic, criterion, and execution
must be identifiable.

An **Environment Guardrail** is narrowly scoped to isolation between
Environments or protection of Production data and artifacts. Examples include
explicit Environment selection, the Production build gate, and separation of
Production and verification artifacts. Historical script names or exact
command strings are not guardrails unless they protect such a risk.

Model-quality evaluations are a separate discipline, not unit or E2E tests.
Their harness will live outside test directories and will not be included in the
unit command. Existing evaluation documentation and runner configuration
disagree about whether in-process cases use a real or mocked Gateway; document
that limitation without claiming real-model quality or changing evaluation
execution as part of this migration.

The client-bundle secrets check must report explicitly when its artifact is
absent in fast verification. Full verification must first run the isolated
`build:verify` and then require inspection of the resulting bundle. The
Production build is not used for this check.

### Migration scope

Compaction is the first vertical migration. Subsequent changes remove AI
injection ports and composition whose only justification is test substitution,
preserving each feature's behavior. The real Chat Mode Router will also be used
in the Test Environment, with Decisions responses simulated over HTTP. The
image adapter remains because it performs necessary SDK translation.

Chatbot E2E keeps the Coding Agent Worker stub; the Worker is tested separately.
This does not verify the real chatbot-to-Worker connection, which is outside
this migration. Preserve functional guarantees when moving or consolidating
tests; identify equivalent coverage before removing an active test. A skipped
test is not coverage: investigate whether its intended behavior is still
supported before restoring or removing it. Remove obsolete doubles and tests
of removed wiring rather than layering equivalent strategies indefinitely.

## Trade-offs and limits

- Concrete features depend on the shared inference infrastructure rather than
  supporting arbitrary injected AI implementations.
- Some tests exercise more SDK and protocol code, potentially increasing runtime
  and the number of failures caused by a shared integration defect.
- HTTP doubles do not prove compatibility with real providers or model quality.
- Static E2E scenarios avoid catalog mutation and a remote control plane, but
  must not rely on global mutable execution state.
- No production correlation changes, live-provider evaluations, performance
  thresholds, or delivery of historical E2E parallelization are included.

See the [local implementation spec](../../.scratch/model-gateway-testing/spec.md)
for the original feature-migration scope and sequencing, and the
[guarantees accounting](../model-gateway-testing-migration.md) for completed
substitutions.

## Implementation status

The test taxonomy, layout, commands, bundle-check ordering, evaluation location
and historical E2E reclassification described above were implemented by the
social-testing migration (`.scratch/social-testing-migration/`, completed
2026-10-29). Each package keeps `tests/unit/` (organized by capability) next to
its E2E suite; the root `pnpm test:unit` covers every package plus the Model
Gateway Python suite, `pnpm test:infra` is the explicit provisioned-resource
profile, and `pnpm verify:full` builds the isolated verification bundle before
inspecting it. The commands, profiles and current selection are documented in
[`AGENTS.md`](../../AGENTS.md) and
[`packages/chatbot/tests/AGENTS.md`](../../packages/chatbot/tests/AGENTS.md#execution-profiles).
The policy in this ADR remains the authority.
