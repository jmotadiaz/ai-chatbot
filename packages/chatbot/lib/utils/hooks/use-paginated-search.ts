"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "use-debounce";
import { useInfiniteScroll } from "@/lib/utils/hooks/use-infinite-scroll";

/** One page request of a searchable listing. */
export interface PageRequest {
  /** Already debounced: the value the user settled on, not the keystroke. */
  filter: string;
  limit: number;
  offset: number;
}

/** One page of a searchable listing. */
export interface Page<TItem> {
  items: TItem[];
  hasMore: boolean;
}

export type FetchPage<TItem> = (request: PageRequest) => Promise<Page<TItem>>;

export interface UsePaginatedSearchParams<TItem> {
  /** First page rendered by the server, so mounting does not refetch it. */
  initialItems: TItem[];
  initialHasMore: boolean;
  /**
   * Requests one page. The hook reads it through a ref, so an inline closure is
   * fine: a new identity per render neither restarts pagination nor refetches.
   */
  fetchPage: FetchPage<TItem>;
  itemsPerPage?: number;
  debounceMs?: number;
}

export interface PaginatedSearch<TItem> {
  items: TItem[];
  /** Exposed for feature-specific optimistic updates (pin, delete). */
  setItems: React.Dispatch<React.SetStateAction<TItem[]>>;
  hasMore: boolean;
  isLoading: boolean;
  /** Raw input value, updated on every keystroke. */
  filter: string;
  setFilter: (value: string) => void;
  /** Debounced value the last page request used. */
  debouncedFilter: string;
  scrollContainer: React.RefObject<HTMLUListElement | null>;
  /** Sentinel props for the item that mounts the infinite-scroll observer. */
  getItemProps: (index: number) => {
    loaderRef?: React.RefCallback<HTMLLIElement>;
  };
}

/**
 * A paginated, server-filtered listing: the search input state, its debounce
 * and the infinite-scroll cursor over `useInfiniteScroll`, which owns the page
 * arithmetic. The hook knows nothing about what it lists; each feature supplies
 * `fetchPage` and renders its own rows.
 */
export function usePaginatedSearch<TItem>({
  initialItems,
  initialHasMore,
  fetchPage,
  itemsPerPage = 20,
  debounceMs = 300,
}: UsePaginatedSearchParams<TItem>): PaginatedSearch<TItem> {
  const [filter, setFilter] = useState("");
  const [debouncedFilter] = useDebounce(filter, debounceMs);

  const fetchPageRef = useRef(fetchPage);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
  }, [fetchPage]);

  const loadPage = useCallback(
    ({ limit, offset }: { limit: number; offset: number }) =>
      fetchPageRef.current({ filter: debouncedFilter, limit, offset }),
    [debouncedFilter],
  );

  const {
    items,
    setItems,
    hasMore,
    isFetching,
    refresh,
    scrollContainer,
    getItemProps,
  } = useInfiniteScroll<TItem>({
    loadAction: loadPage,
    itemsPerPage,
    initialItems,
    initialHasMore,
  });

  // The server already rendered the first page of the empty filter: only a
  // filter change refetches, and it restarts from offset 0.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      if (debouncedFilter === "") return;
    }
    refresh();
  }, [debouncedFilter, refresh]);

  return useMemo(
    () => ({
      items,
      setItems,
      hasMore,
      isLoading: isFetching,
      filter,
      setFilter,
      debouncedFilter,
      scrollContainer,
      getItemProps,
    }),
    [
      items,
      setItems,
      hasMore,
      isFetching,
      filter,
      debouncedFilter,
      scrollContainer,
      getItemProps,
    ],
  );
}
