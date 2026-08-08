// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ReasoningControl } from "@/components/code/reasoning-control";

afterEach(() => cleanup());

describe("ReasoningControl", () => {
  it("renders nothing when the model only supports off", () => {
    const { container } = render(
      <ReasoningControl level="off" levels={["off"]} isLoading={false} onSelect={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the current level and opens a dropdown with the available levels", async () => {
    const onSelect = vi.fn();
    render(
      <ReasoningControl
        level="high"
        levels={["off", "high", "xhigh"]}
        isLoading={false}
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

  it("disables the trigger while loading", () => {
    render(
      <ReasoningControl level={null} levels={["off", "high"]} isLoading={true} onSelect={vi.fn()} />,
    );
    // toBeDisabled is a jest-dom matcher, which is not registered in this
    // repo's vitest setup; assert the native property instead.
    expect(screen.getByRole("button", { name: /Reasoning effort/ })).toHaveProperty("disabled", true);
  });
});
