import { useEffect, useRef } from "react";

export interface UseIntersectionObserverParams {
  onIntersect: () => void;
  once?: boolean;
  threshold?: number;
  rootMargin?: string;
}

export interface UseIntersectionObserverReturn<
  TScrollContainerElement,
  TLoaderElement
> {
  scrollContainer: React.RefObject<TScrollContainerElement | null>;
  loader: React.RefObject<TLoaderElement | null>;
}

export const useIntersectionObserver = <
  TScrollContainerElement extends HTMLElement = HTMLDivElement,
  TLoaderElement extends HTMLElement = HTMLDivElement
>({
  onIntersect,
  once = false,
  rootMargin = "100px",
  threshold = 1,
}: UseIntersectionObserverParams): UseIntersectionObserverReturn<
  TScrollContainerElement,
  TLoaderElement
> => {
  const loader = useRef<TLoaderElement | null>(null);
  const scrollContainer = useRef<TScrollContainerElement | null>(null);

  useEffect(() => {
    if (!scrollContainer.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onIntersect();
          if (once) {
            observer.disconnect();
          }
        }
      },
      { threshold, root: scrollContainer.current, rootMargin }
    );

    const currentLoader = loader.current;
    if (currentLoader) {
      console.log("observe");
      observer.observe(currentLoader);
    }

    return () => {
      observer.disconnect();
    };
  }, [onIntersect, once, rootMargin, threshold]);

  return {
    loader,
    scrollContainer,
  };
};
