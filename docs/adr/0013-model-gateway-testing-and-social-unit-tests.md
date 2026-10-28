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

The target categories are social unit tests and E2E. Social unit tests may
exercise real collaborators in-process (including PGlite for persistence and
MSW at the Gateway HTTP seam); tests requiring external PostgreSQL or other
provisioned infrastructure remain selectable through an explicit execution
profile. Self-contained unit tests are the default, and full verification
includes the infrastructure profile. Contract purpose and resource requirements
remain identifiable.

### Social unit by default; E2E by exception

Use social unit tests unless the guarantee requires at least one of:

1. **Real navigation or lifecycle:** actual routing, redirects, deep links,
   history, reload, or leaving and returning to a screen. Asserting a request
   to navigate is not itself a reason for E2E.
2. **Real browser-application interaction:** behavior that a local test replaces
   or cannot faithfully reproduce, such as session cookies with redirects,
   stream disconnection/reconnection, or client recovery while server work
   continues. UI events or streaming alone do not qualify.
3. **Representative assembly of a critical journey:** verifying that the
   deployed entry point, routing/middleware, server behavior, persistence, and
   visible result are wired together. Keep a representative journey, not the
   entire matrix of inputs or inference responses at E2E scope.

Every E2E must state: "This test needs the deployed application because it
verifies ___; a social unit test would omit ___." This identifies the deployment
risk; it does not require proving that smaller tests can cover none of the flow.

Multiple modules, PostgreSQL, controlled HTTP, rendered UI, tool calls, streaming,
or business importance alone do not justify E2E. Variants exercising the same
assembly risk belong in social unit tests unless they introduce a distinct
E2E guarantee. Apply the criteria within the test's declared system scope.

### Migration scope

Compaction is the first vertical migration. Subsequent changes remove AI
injection ports and composition whose only justification is test substitution,
preserving each feature's behavior. The real Chat Mode Router will also be used
in the Test Environment, with Decisions responses simulated over HTTP. The
image adapter remains because it performs necessary SDK translation.

Chatbot E2E keeps the Coding Agent Worker stub; the Worker is tested separately.
E2E cases are reduced only when their guarantees are preserved elsewhere.
Obsolete doubles and tests of removed wiring are replaced, not permanently
layered beside equivalent new tests.

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
for module responsibilities, execution profiles, and migration sequencing.
This ADR records the accepted target; it does not mean the migration has been
implemented.
