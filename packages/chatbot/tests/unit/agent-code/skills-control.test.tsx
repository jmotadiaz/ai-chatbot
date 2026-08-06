// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SkillsControl } from "@/components/code/skills-control";

afterEach(() => cleanup());

function renderControl() {
  return render(
    <SkillsControl
      skills={[{ name: "code-review", description: "Review code changes" }]}
      selectedSkills={[]}
      onToggle={vi.fn()}
      prompts={[]}
      onPromptSelect={vi.fn()}
    />,
  );
}

describe("SkillsControl tabs", () => {
  it("highlights the active tab with the standard foreground color", async () => {
    renderControl();
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
