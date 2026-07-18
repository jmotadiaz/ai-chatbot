// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAgentConversationScroll } from "@/lib/features/code/hooks/use-agent-conversation-scroll";

describe("useAgentConversationScroll", () => {
  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes scroll state with showTop=false and showBottom=false", () => {
    const { result } = renderHook(() =>
      useAgentConversationScroll({ items: [] }),
    );
    expect(result.current.showTop).toBe(false);
    expect(result.current.showBottom).toBe(false);
    expect(result.current.scrollContainerRef.current).toBeNull();
  });

  it("handles scrollToTop and scrollToBottom", () => {
    const { result } = renderHook(() =>
      useAgentConversationScroll({ items: [] }),
    );

    const mockElement = {
      scrollTo: vi.fn(),
      scrollTop: 0,
      clientHeight: 500,
      scrollHeight: 1000,
    } as unknown as HTMLDivElement;

    (
      result.current.scrollContainerRef as { current: HTMLDivElement | null }
    ).current = mockElement;

    act(() => {
      result.current.scrollToTop();
    });
    expect(mockElement.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });

    act(() => {
      result.current.scrollToBottom();
    });
    expect(mockElement.scrollTo).toHaveBeenCalledWith({
      top: 1000,
      behavior: "smooth",
    });
  });
});
