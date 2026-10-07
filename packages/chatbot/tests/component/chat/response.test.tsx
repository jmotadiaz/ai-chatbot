/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Response } from "@/components/chat/response";

afterEach(cleanup);

const TABLE_MD = [
  "| Curso | Descripción |",
  "| --- | --- |",
  "| [Certificado AI](./certificado.md) | [Inscripción en academia y prueba de nivel](./nivel.md) |",
].join("\n");

describe("markdown table cells", () => {
  it("renders without word-breaking utilities so columns size to their words", async () => {
    const view = render(<Response>{TABLE_MD}</Response>);

    // The stylesheet rule in globals.css keys on this hook.
    const table = await waitFor(() => {
      const found = view.container.querySelector(
        'table[data-streamdown="table"]',
      );
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });

    // `wrap-anywhere`/`wrap-break-word` on a cell shrink its min-content width
    // to one character, which crushes the column and splits words mid-word.
    for (const cell of table.querySelectorAll("th, td")) {
      expect(cell.className).not.toMatch(
        /wrap-anywhere|wrap-break-word|break-words|break-all/,
      );
    }
  });

  it("keeps the stylesheet rule that forbids word breaks in cells", () => {
    const globalsPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../app/globals.css",
    );
    const css = readFileSync(globalsPath, "utf8");

    // Cells and their inline content (links carry `wrap-anywhere`) must reset
    // to `overflow-wrap: normal`, or content-heavy columns go narrow again.
    expect(css).toMatch(
      /\[data-streamdown="table"\] :is\(th, td\)[^{}]*\{[^}]*overflow-wrap: normal/,
    );
    expect(css).toMatch(/\[data-streamdown="table"\] :is\(th, td\) \*/);
  });
});
