import { ensureMockGateway, MOCK_GATEWAY_PORT } from "./server";

/**
 * CLI entry of the Mock Model Gateway: `pnpm --filter chatbot exec tsx tests/mocks/gateway/main.ts`
 * (or `tsx ... -- --port 4001`). For the tests and the e2e global setup, use
 * `ensureMockGateway()`/`stopMockGateway()` directly.
 */
const portArg = process.argv.indexOf("--port");
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : MOCK_GATEWAY_PORT;

void ensureMockGateway({ port }).then((handle) => {
  console.log(`[mock-model-gateway] listening on http://127.0.0.1:${handle.port}`);
});
