import { stopMockGateway } from "../mocks/gateway/server";

async function globalTeardown() {
  // The Model Gateway mock belongs to this process (the global setup started it): shut it down here.
  await stopMockGateway();
}

export default globalTeardown;
