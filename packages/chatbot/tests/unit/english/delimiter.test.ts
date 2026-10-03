import { describe, expect, it } from "vitest";
import {
  DELIMITERS,
  pickDelimiter,
} from "../../../lib/features/english/workflows/utils";

describe("pickDelimiter: deterministic wrapper selection", () => {
  it("picks the first candidate whose closing marker is absent from the text", () => {
    expect(pickDelimiter("hola mundo")).toEqual({ open: "«", close: "»" });
    // `»` conflicts → falls through to the next candidate.
    expect(pickDelimiter("un texto con » dentro")).toEqual({
      open: "\"",
      close: "\"",
    });
    // `»` and `"` conflict → brackets.
    expect(pickDelimiter('» y " pero sin corchetes')).toEqual({
      open: "[",
      close: "]",
    });
  });

  it("only looks at the closing marker (a break-out needs the close, never the open)", () => {
    // Stray opening markers do not disqualify a candidate.
    expect(pickDelimiter("un texto con « y [ y { y < sueltos")).toEqual({
      open: "«",
      close: "»",
    });
  });

  it("returns null when every candidate conflicts", () => {
    const everything = `» " ] } \`\`\` >`;
    expect(pickDelimiter(everything)).toBeNull();
  });

  it("is stable for empty text", () => {
    expect(pickDelimiter("")).toEqual({ open: "«", close: "»" });
  });

  it("covers the candidates in rarest-first order", () => {
    expect(DELIMITERS.map((d) => d.close)).toEqual([
      "»",
      "\"",
      "]",
      "}",
      "```",
      ">",
    ]);
  });
});
