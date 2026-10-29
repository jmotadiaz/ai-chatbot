// @vitest-environment jsdom

/**
 * jsdom guard: the main entry of the toolkit must load in a browser-like worker.
 * The chatbot harness used to break with `No such built-in module: node:http` when
 * a jsdom test imported the mock; the Node server lives behind the `./server`
 * subpath export and this test fails to collect if `.` ever imports it.
 */

import { describe, expect, it } from "vitest";
import * as toolkit from "../../src/index";

describe("main entry under jsdom", () => {
  it("loads without Node built-ins and exposes the protocol layer", () => {
    expect(toolkit.renderChatResponse(toolkit.textReply("hi"), { stream: true }).kind).toBe(
      "sse",
    );
    expect(toolkit.createGatewayScenario).toBeTypeOf("function");
    expect(toolkit.createGatewayHandlers).toBeTypeOf("function");
    // The HTTP server is only reachable through the `./server` subpath.
    expect("startGatewayServer" in toolkit).toBe(false);
  });

  it("dispatches a scenario without the HTTP server", () => {
    const scenario = toolkit.createGatewayScenario({ catalog: { public: [{ id: "basic" }] } });
    const result = scenario.handle("GET", "/v1/models/catalog", {
      headers: { authorization: "Bearer test-key" },
    });
    expect(result).toMatchObject({ kind: "json", status: 200 });
  });
});
