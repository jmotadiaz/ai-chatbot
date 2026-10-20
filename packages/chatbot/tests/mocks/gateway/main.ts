import { ensureMockGateway, MOCK_GATEWAY_PORT } from "./server";

/**
 * Entry CLI del Mock Model Gateway: `pnpm --filter chatbot exec tsx tests/mocks/gateway/main.ts`
 * (o `tsx ... -- --port 4001`). Para los tests y el e2e global setup, usar
 * `ensureMockGateway()`/`stopMockGateway()` directamente.
 */
const portArg = process.argv.indexOf("--port");
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : MOCK_GATEWAY_PORT;

void ensureMockGateway({ port }).then((handle) => {
  console.log(`[mock-model-gateway] listening on http://127.0.0.1:${handle.port}`);
});
