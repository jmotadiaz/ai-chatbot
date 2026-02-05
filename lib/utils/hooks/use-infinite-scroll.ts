import { useCallback } from "react";
import { useIntersectionObserver } from "./intersection";

interface UseInfiniteScrollItemsParams<T> {
  items: T[];
  hasMore: boolean;
  itemsPerPage: number;
  onLoadMore: () => void;
}

interface ItemProps {
  loaderRef?: React.RefCallback<HTMLLIElement>;
}

interface UseInfiniteScrollItemsReturn {
  scrollContainer: React.RefObject<HTMLUListElement | null>;
  getItemProps: (index: number) => ItemProps;
}

export function useInfiniteScroll<T>({
  items,
  hasMore,
  itemsPerPage,
  onLoadMore,
}: UseInfiniteScrollItemsParams<T>): UseInfiniteScrollItemsReturn {
  const { loader, scrollContainer } = useIntersectionObserver<
    HTMLUListElement,
    HTMLLIElement
  >({
    onIntersect: onLoadMore,
  });

  const getItemProps = useCallback(
    (index: number): ItemProps => {
      const targetIndex = items.length - Math.ceil(itemsPerPage / 2);
      const shouldAttachRef = hasMore && index === targetIndex;

      return {
        loaderRef: shouldAttachRef ? loader : undefined,
      };
    },
    [items.length, itemsPerPage, hasMore, loader],
  );

  return {
    scrollContainer,
    getItemProps,
  };
}
