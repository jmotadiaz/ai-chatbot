import { useCallback, useRef, useState, useTransition } from "react";
import { useIntersectionObserver } from "./intersection";

// Generic server action signature - consumer provides a wrapped action
export type InfiniteScrollAction<TItem> = (params: {
  limit: number;
  offset: number;
}) => Promise<{
  items: TItem[];
  hasMore: boolean;
}>;

interface UseInfiniteScrollParams<TItem> {
  /** Server action to load more items (should be wrapped in useCallback by consumer) */
  loadAction: InfiniteScrollAction<TItem>;
  /** Items per page to load */
  itemsPerPage?: number;
  /** Initial items loaded from server */
  initialItems?: TItem[];
  /** Initial hasMore state from server */
  initialHasMore?: boolean;
}

interface UseInfiniteScrollReturn<TItem> {
  items: TItem[];
  setItems: React.Dispatch<React.SetStateAction<TItem[]>>;
  hasMore: boolean;
  isFetching: boolean;
  refresh: () => void;
  scrollContainer: React.RefObject<HTMLUListElement | null>;
  getItemProps: (index: number) => {
    loaderRef?: React.RefCallback<HTMLLIElement>;
  };
}

/**
 * A hook that encapsulates the logic for infinite scrolling.
 * Handles offset management, hasMore state, and integrates with a server action.
 *
 * IMPORTANT: The loadAction should be wrapped in useCallback by the consumer
 * with all necessary dependencies (filter, projectId, etc).
 */
export function useInfiniteScroll<TItem>({
  loadAction,
  itemsPerPage = 20,
  initialItems = [],
  initialHasMore = false,
}: UseInfiniteScrollParams<TItem>): UseInfiniteScrollReturn<TItem> {
  const [items, setItems] = useState<TItem[]>(initialItems);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [isFetching, startTransition] = useTransition();
  const offsetRef = useRef(initialItems.length);

  /**
   * Load more items
   */
  const loadMore = useCallback(() => {
    if (!hasMore || isFetching) return;

    startTransition(async () => {
      const result = await loadAction({
        limit: itemsPerPage,
        offset: offsetRef.current,
      });

      setItems((current) => [...current, ...result.items]);
      setHasMore(result.hasMore);
      offsetRef.current += result.items.length;
    });
  }, [hasMore, isFetching, loadAction, itemsPerPage]);

  /**
   * Refresh/Reset items from offset 0
   */
  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await loadAction({
        limit: itemsPerPage,
        offset: 0,
      });

      setItems(result.items);
      setHasMore(result.hasMore);
      offsetRef.current = result.items.length;
    });
  }, [loadAction, itemsPerPage]);

  const { loader, scrollContainer } = useIntersectionObserver<
    HTMLUListElement,
    HTMLLIElement
  >({
    onIntersect: loadMore,
  });

  const getItemProps = useCallback(
    (index: number) => {
      const targetIndex = items.length - Math.ceil(itemsPerPage / 2);
      const shouldAttachRef = hasMore && index === targetIndex;

      return {
        loaderRef: shouldAttachRef ? loader : undefined,
      };
    },
    [items.length, itemsPerPage, hasMore, loader],
  );

  return {
    items,
    setItems,
    hasMore,
    isFetching,
    refresh,
    scrollContainer,
    getItemProps,
  };
}
