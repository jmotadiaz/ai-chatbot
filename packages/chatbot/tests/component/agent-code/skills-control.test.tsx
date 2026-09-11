/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SkillsControl } from "@/components/code/skills-control";

afterEach(() => cleanup());

const FILTER_TESTID = "skills-prompts-filter-input";

function renderFullControl(overrides: Partial<Parameters<typeof SkillsControl>[0]> = {}) {
  const props = {
    skills: [
      { name: "code-review", description: "Review code changes" },
      { name: "pdf-reader", description: "Review code changes" },
      { name: "deploy", description: "Ship to production" },
    ],
    selectedSkills: [] as string[],
    onToggle: vi.fn(),
    prompts: [
      { name: "summary", description: "Summarize", inputs: [] },
      { name: "pdf-export", description: "Summarize", inputs: [] },
    ],
    onPromptSelect: vi.fn(),
    ...overrides,
  };
  render(<SkillsControl {...props} />);
  return props;
}

async function openPopup() {
  fireEvent.click(screen.getByLabelText("Select skills"));
  await screen.findByRole("tab", { name: "Skills" });
}

describe("SkillsControl tabs", () => {
  it("highlights the active tab with the standard foreground color", async () => {
    renderFullControl({
      skills: [{ name: "code-review", description: "Review code changes" }],
      prompts: [],
    });
    fireEvent.click(screen.getByLabelText("Select skills"));

    // El popup se abre vía startTransition: findByRole espera el flush.
    const skillsTab = await screen.findByRole("tab", { name: "Skills" });
    const promptsTab = screen.getByRole("tab", { name: "Prompts" });

    expect(skillsTab.className).toContain("border-foreground");
    expect(skillsTab.className).toContain("text-foreground");
    expect(promptsTab.className).not.toContain("border-foreground");

    fireEvent.click(promptsTab);

    expect(promptsTab.className).toContain("border-foreground");
    expect(skillsTab.className).not.toContain("border-foreground");
  });
});

describe("SkillsControl filter", () => {
  it("filters by name only, case-insensitive substring; empty shows all", async () => {
    renderFullControl();
    await openPopup();
    const input = screen.getByTestId(FILTER_TESTID);

    // Vacío: todos visibles.
    expect(screen.getByRole("button", { name: /code-review/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /pdf-reader/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /deploy/ })).toBeDefined();

    // Match solo por name: "review" está en la description de pdf-reader
    // pero no en su name, así que solo queda code-review.
    fireEvent.change(input, { target: { value: "PDF" } });
    expect(screen.queryByRole("button", { name: /code-review/ })).toBeNull();
    expect(screen.getByRole("button", { name: /pdf-reader/ })).toBeDefined();
    expect(screen.queryByRole("button", { name: /deploy/ })).toBeNull();

    fireEvent.change(input, { target: { value: "review" } });
    expect(screen.getByRole("button", { name: /code-review/ })).toBeDefined();
    expect(screen.queryByRole("button", { name: /pdf-reader/ })).toBeNull();
  });

  it("shows a distinct no-results state and clears with the X button", async () => {
    renderFullControl();
    await openPopup();
    const input = screen.getByTestId(FILTER_TESTID) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "zzz" } });
    expect(await screen.findByText('No results for "zzz".')).toBeDefined();
    // La X limpia sin cerrar el popup.
    fireEvent.click(screen.getByLabelText("Clear filter"));
    expect(input.value).toBe("");
    expect(screen.getByRole("button", { name: /code-review/ })).toBeDefined();
  });

  it("Enter selects the first match and keeps the popup open", async () => {
    const props = renderFullControl();
    await openPopup();
    const input = screen.getByTestId(FILTER_TESTID);

    fireEvent.change(input, { target: { value: "pdf" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onToggle).toHaveBeenCalledWith("pdf-reader");
    // Sigue abierto: el input y la tab persisten.
    expect(screen.getByTestId(FILTER_TESTID)).toBeDefined();
  });

  it("Enter does nothing with zero results", async () => {
    const props = renderFullControl();
    await openPopup();
    const input = screen.getByTestId(FILTER_TESTID);

    fireEvent.change(input, { target: { value: "zzz" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it("shares one input between tabs: switching keeps query, focus node and filters", async () => {
    renderFullControl();
    await openPopup();

    const skillsInput = screen.getByTestId(FILTER_TESTID) as HTMLInputElement;
    fireEvent.change(skillsInput, { target: { value: "pdf" } });
    expect(screen.queryByRole("button", { name: /deploy/ })).toBeNull();

    // Cambiar de tab no desmonta el input: mismo nodo, misma query, el
    // teclado virtual no se cierra y reabre.
    fireEvent.click(screen.getByRole("tab", { name: "Prompts" }));
    const promptsInput = screen.getByTestId(FILTER_TESTID) as HTMLInputElement;
    expect(promptsInput).toBe(skillsInput);
    expect(promptsInput.value).toBe("pdf");
    expect(promptsInput.getAttribute("aria-label")).toBe("Filter prompts");
    expect(screen.getByRole("button", { name: /pdf-export/ })).toBeDefined();
    expect(screen.queryByRole("button", { name: /summary/ })).toBeNull();

    // Volver a Skills: la query sigue ahí.
    fireEvent.click(screen.getByRole("tab", { name: "Skills" }));
    const backInput = screen.getByTestId(FILTER_TESTID) as HTMLInputElement;
    expect(backInput).toBe(skillsInput);
    expect(backInput.value).toBe("pdf");
    expect(screen.getByRole("button", { name: /pdf-reader/ })).toBeDefined();
  });

  it("keeps focus in the filter input when switching tabs", async () => {
    renderFullControl();
    await openPopup();

    const input = screen.getByTestId(FILTER_TESTID) as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    // Sin retención, el tap movería el foco al botón de la tab y el
    // teclado virtual se cerraría.
    fireEvent.click(screen.getByRole("tab", { name: "Prompts" }));
    expect(document.activeElement).toBe(screen.getByTestId(FILTER_TESTID));
  });

  it("filters prompts and Enter opens the first match", async () => {
    const props = renderFullControl();
    await openPopup();
    fireEvent.click(screen.getByRole("tab", { name: "Prompts" }));
    const input = screen.getByTestId(FILTER_TESTID);

    fireEvent.change(input, { target: { value: "PDF" } });
    expect(screen.getByRole("button", { name: /pdf-export/ })).toBeDefined();
    expect(screen.queryByRole("button", { name: /summary/ })).toBeNull();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onPromptSelect).toHaveBeenCalledWith("pdf-export");
  });
});
