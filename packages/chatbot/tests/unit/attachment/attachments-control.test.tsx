/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AttachmentsControl } from "@/components/chat/attachments/control";

/**
 * Attachment menu rules (ticket 08, replaces the `attachments.spec` E2E).
 * The menu is pure React + DOM: which options exist depends on the model's
 * `supportedFiles` and on whether the browser exposes `input.capture`.
 */
function renderMenu(supportedFiles: ("pdf" | "img")[]) {
  render(
    <AttachmentsControl
      handleFileChange={vi.fn()}
      supportedFiles={supportedFiles}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Attach files" }));
  return screen.getByLabelText("Attachment options");
}

describe("AttachmentsControl menu rules", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete (HTMLInputElement.prototype as { capture?: unknown }).capture;
  });

  it("offers Image only for models that accept images", () => {
    const menu = renderMenu(["img"]);
    expect(menu.textContent).toContain("Image");
  });

  it("hides Image for text-only models while keeping Document", () => {
    const menu = renderMenu([]);
    expect(menu.textContent).not.toContain("Image");
    expect(menu.textContent).toContain("Document");
  });

  it("always offers Document regardless of model capabilities", () => {
    expect(renderMenu(["img", "pdf"]).textContent).toContain("Document");
    cleanup();
    expect(renderMenu([]).textContent).toContain("Document");
  });

  it("hides Camera when the browser does not support input capture", () => {
    const menu = renderMenu(["img"]);
    expect(menu.textContent).not.toContain("Camera");
  });

  it("offers Camera when the browser exposes input capture", () => {
    Object.defineProperty(HTMLInputElement.prototype, "capture", {
      configurable: true,
      value: "",
    });
    const menu = renderMenu(["img"]);
    expect(menu.textContent).toContain("Camera");
  });

  it("accepts PDF in the Document picker only when the model supports pdf", () => {
    const withPdf = renderMenu(["pdf"]);
    const input = withPdf.querySelector<HTMLInputElement>("#document-input");
    expect(input?.accept).toContain("application/pdf");
    cleanup();

    const withoutPdf = renderMenu([]);
    const plain = withoutPdf.querySelector<HTMLInputElement>("#document-input");
    expect(plain?.accept).not.toContain("application/pdf");
  });
});
