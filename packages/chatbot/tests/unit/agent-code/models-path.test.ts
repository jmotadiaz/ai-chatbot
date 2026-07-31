import { afterEach, describe, expect, it } from "vitest";
import { getModelsJsonPath } from "coding-agent/models";

describe("getModelsJsonPath", () => {
  const original = process.env.CODING_AGENT_MODELS_JSON;

  afterEach(() => {
    if (original === undefined) delete process.env.CODING_AGENT_MODELS_JSON;
    else process.env.CODING_AGENT_MODELS_JSON = original;
  });

  it("honours the CODING_AGENT_MODELS_JSON override", () => {
    process.env.CODING_AGENT_MODELS_JSON = "/tmp/custom-models.json";
    expect(getModelsJsonPath()).toBe("/tmp/custom-models.json");
  });

  it("defaults to models.json inside the Pi agent dir", () => {
    delete process.env.CODING_AGENT_MODELS_JSON;
    expect(getModelsJsonPath()).toMatch(/models\.json$/);
  });

  it("treats an empty override as unset", () => {
    // Playwright's web server forwards unset variables as empty strings.
    process.env.CODING_AGENT_MODELS_JSON = "";
    expect(getModelsJsonPath()).toMatch(/models\.json$/);
  });
});
