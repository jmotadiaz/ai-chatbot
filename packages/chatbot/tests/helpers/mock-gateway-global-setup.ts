import {
  MOCK_GATEWAY_PORT,
  ensureMockGateway,
  stopMockGateway,
} from "../mocks/gateway/server";

/**
 * Vitest GlobalSetup (ADR 0010/0011): the whole chatbot talks HTTP to the Model
 * Gateway, so the suite needs the Mock Model Gateway available BEFORE any test —
 * and on the CANONICAL port `:4001`, which is what `config.modelGatewayUrl()`
 * returns in the Test Environment (the static bundle is frozen: mutating
 * `process.env.MODEL_GATEWAY_URL` no longer has any effect, which was exactly
 * the trick of the old `tests/helpers/mock-gateway-setup.ts`).
 *
 * Why `globalSetup` (main process) and not `setupFiles` (each worker):
 *
 * 1. The server lives in the main process with its own life cycle: it comes up
 *    with the run and goes down with the `teardown` returned here, without
 *    sharing a process with any worker (a worker that died did not leave the
 *    others without a server).
 * 2. `setupFiles` imported `node:http` via `mocks/gateway/server`, and the
 *    component test files with `@vitest-environment jsdom` failed to collect
 *    with `No such built-in module: node:` (hook FIXME pre-commit). The mock no
 *    longer goes through the jsdom workers.
 * 3. No `process.env`: the only configuration source is the test bundle.
 *
 * `ensureMockGateway` is idempotent and safe against concurrent runs (it reuses
 * an already probeable mock, e.g. Playwright's global-setup one);
 * `stopMockGateway` only closes the server THIS process opened.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const handle = await ensureMockGateway({ port: MOCK_GATEWAY_PORT });
  console.log(
    `[global-setup] Mock Model Gateway ${handle.started ? "started" : "reused"} on :${handle.port}`,
  );
  return async () => {
    await stopMockGateway();
  };
}
