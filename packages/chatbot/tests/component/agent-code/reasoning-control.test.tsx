/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ReasoningControl } from "@/components/code/reasoning-control";

afterEach(() => cleanup());

describe("ReasoningControl", () => {
  it("renders nothing when the model only supports off", () => {
    const { container } = render(
      <ReasoningControl level="off" levels={["off"]} onSelect={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the current level and opens a dropdown with the available levels", async () => {
    const onSelect = vi.fn();
    render(
      <ReasoningControl
        level="high"
        levels={["off", "high", "xhigh"]}
        onSelect={onSelect}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Reasoning effort: high/ });
    expect(trigger).toBeTruthy();

    fireEvent.click(trigger);
    // El popup se abre vía startTransition: findByRole espera el flush.
    fireEvent.click(await screen.findByRole("menuitem", { name: /xhigh/ }));

    expect(onSelect).toHaveBeenCalledWith("xhigh");
  });

  it("does not submit the surrounding form when a level item is clicked", async () => {
    const onSubmitSpy = vi.fn();
    const onSelect = vi.fn();
    render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmitSpy();
        }}
      >
        <ReasoningControl
          level="high"
          levels={["off", "high", "xhigh"]}
          onSelect={onSelect}
        />
      </form>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Reasoning effort: high/ }));
    // El popup se abre vía startTransition: findByRole espera el flush.
    fireEvent.click(await screen.findByRole("menuitem", { name: /off/ }));

    expect(onSubmitSpy).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith("off");
  });

  it("does not apply the active style to the trigger", () => {
    render(
      <ReasoningControl
        level="high"
        levels={["off", "high", "xhigh"]}
        onSelect={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: /Reasoning effort: high/ });
    expect(trigger.className).not.toContain("bg-blue-600");
  });

  it("disables the trigger while there is no level to show yet", () => {
    render(<ReasoningControl level={null} levels={["off", "high"]} onSelect={vi.fn()} />);
    // toBeDisabled is a jest-dom matcher, which is not registered in this
    // repo's vitest setup; assert the native property instead.
    expect(screen.getByRole("button", { name: /Reasoning effort/ })).toHaveProperty("disabled", true);
  });
});
