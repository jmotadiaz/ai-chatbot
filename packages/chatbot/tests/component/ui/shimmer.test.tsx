/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Shimmer } from "@/components/ui/shimmer";

describe("Shimmer ReactNode", () => {
  it("renders ReactNode children with shimmer classes", () => {
    const { container } = render(
      <Shimmer as="span" textLength={10}>
        <span>Shell</span> <span>ls -la</span>
      </Shimmer>
    );
    const el = container.firstChild as HTMLElement;
    expect(el.textContent).toBe("Shell ls -la");
    expect(el.className).toContain("bg-clip-text");
    expect(el.className).toContain("text-transparent");
  });

  it("still works with string children (backwards compat)", () => {
    const { container } = render(<Shimmer>hello world</Shimmer>);
    expect(container.textContent).toBe("hello world");
  });
});
