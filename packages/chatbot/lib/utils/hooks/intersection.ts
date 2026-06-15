import { useEffect, useRef, useState } from "react";

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
  loader: React.RefCallback<TLoaderElement>;
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
  const [loader, setLoader] = useState<TLoaderElement | null>(null);
  const scrollContainer = useRef<TScrollContainerElement | null>(null);

  useEffect(() => {
    if (!scrollContainer.current || !loader) return;
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

    observer.observe(loader);

    return () => {
      observer.disconnect();
    };
  }, [onIntersect, loader, once, rootMargin, threshold]);

  return {
    loader: setLoader,
    scrollContainer,
  };
};
