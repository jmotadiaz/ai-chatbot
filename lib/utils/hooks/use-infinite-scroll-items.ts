import { useCallback } from "react";
import { useIntersectionObserver } from "./intersection";

interface UseInfiniteScrollItemsParams<T> {
  items: T[];
  hasMore: boolean;
  itemsPerPage: number;
  onLoadMore: () => void;
  getItemKey: (item: T) => string;
  getItemDeletingState?: (item: T) => boolean;
  onItemDelete?: (item: T) => void;
}

interface ItemProps<T> {
  item: T;
  isDeleting?: boolean;
  onDelete?: (item: T) => void;
  loaderRef?: React.RefCallback<HTMLLIElement>;
}

interface UseInfiniteScrollItemsReturn<T> {
  scrollContainer: React.RefObject<HTMLUListElement | null>;
  getItemProps: (item: T, index: number) => ItemProps<T>;
}

export function useInfiniteScrollItems<T>({
  items,
  hasMore,
  itemsPerPage,
  onLoadMore,
  getItemDeletingState,
  onItemDelete,
}: UseInfiniteScrollItemsParams<T>): UseInfiniteScrollItemsReturn<T> {
  const { loader, scrollContainer } = useIntersectionObserver<
    HTMLUListElement,
    HTMLLIElement
  >({
    onIntersect: onLoadMore,
  });

  const getItemProps = useCallback(
    (item: T, index: number): ItemProps<T> => {
      const targetIndex = items.length - Math.ceil(itemsPerPage / 2);
      const shouldAttachRef = hasMore && index === targetIndex;

      return {
        item,
        isDeleting: getItemDeletingState?.(item),
        onDelete: onItemDelete,
        loaderRef: shouldAttachRef ? loader : undefined,
      };
    },
    [
      items.length,
      itemsPerPage,
      hasMore,
      loader,
      getItemDeletingState,
      onItemDelete,
    ],
  );

  return {
    scrollContainer,
    getItemProps,
  };
}
