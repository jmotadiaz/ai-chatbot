import { stopMockGateway } from "../mocks/gateway/server";

async function globalTeardown() {
  // El mock del Model Gateway es de este proceso (el global setup lo arrancó): bajarlo aquí.
  await stopMockGateway();
}

export default globalTeardown;
