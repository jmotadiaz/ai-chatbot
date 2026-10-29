# Playwright E2E

The repository-level E2E suite: it drives the deployed chatbot in a browser
(Test Environment, `--env=test`) against the real application, a real test
PostgreSQL and the Mock Model Gateway.

Selection policy (unit tests by default; E2E only for guarantees that require
a real browser) lives in
[ADR 0013](../../../../docs/adr/0013-model-gateway-testing-and-social-unit-tests.md).
Every E2E must state what browser behavior it verifies and what a unit test
would omit. The historical cases have not yet been reclassified; their current
presence in this suite does not establish that each meets the policy.

## Layout

```
tests/e2e/
├── global-setup.ts      # waits for :5434, starts the Mock Gateway (:4001), runs Drizzle migrations
├── global-teardown.ts   # closes the Mock Gateway this run started
├── fixtures.ts          # `test` with db/db-seed fixtures (user, chats, projects)
├── db-seed.ts           # the Test Environment user used to log in
├── seed.spec.ts         # representative journey: login + send a message
├── chat/                # chat, hub, resume, projects, settings, attachments
│   ├── components/      # page components (header, model picker, hub panels, sidebar, …)
│   └── pages/           # page objects (chat, hub, history, project)
└── agent-code/          # worker-stub journeys (currently `test.fixme`)
```

## Resources and lifecycle

| Resource | Where it comes from |
| --- | --- |
| PostgreSQL `:5434/test` | `pnpm --filter chatbot db:test:start` (docker compose), run by `test:e2e`; migrations run in `global-setup.ts` |
| Dev server `:3001` | Playwright `webServer` (`scripts/next-cli.ts dev --env=test --webpack`) |
| Mock Model Gateway `:4001` | `global-setup.ts` (`ensureMockGateway`, idempotent) / `global-teardown.ts` |

`workers: 1`: the suite shares one database and one lazily compiled dev server.

## Model scenarios

The Gateway answers come from the consumer-owned catalog and named profile in
[`tests/mocks/gateway/catalog.ts`](../mocks/gateway/catalog.ts) and
[`tests/mocks/gateway/profiles.ts`](../mocks/gateway/profiles.ts); the protocol
itself is the shared toolkit
([`packages/model-gateway/js`](../../../model-gateway/js/README.md)). The catalog
and profile are fixed for the whole run — the application caches the catalog per
process (60 s TTL), so a per-test mutation would leak into later journeys. To add
a capability id or an answer, follow "Adding a New Capability" in
[`tests/AGENTS.md`](../AGENTS.md).

## Commands

```bash
pnpm test:e2e                  # whole suite (root: pnpm --filter chatbot test:e2e)
pnpm test:e2e:ui               # Playwright UI mode
pnpm test:e2e:headed           # visible browser
PLAYWRIGHT_ARGS=--reporter=line pnpm --filter chatbot test:e2e   # line reporter
pnpm stop:test                 # afterwards: stop :3001, the mock :4001 and the test DB
```

`pnpm verify:full` runs this suite together with both vitest profiles and the
Model Gateway's Python suite; see
[`packages/chatbot/tests/AGENTS.md`](../AGENTS.md#execution-profiles).
