"use client";

import { Fragment } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { PaginatedSearch } from "@/lib/utils/hooks/use-paginated-search";

export interface SearchableHistoryTestIds {
  /** Wrapper of the page body; the E2E page objects anchor on it. */
  container: string;
  /** Search input. */
  filter: string;
  /** Accessible name of the list. */
  list: string;
}

export interface SearchableHistoryProps<TItem> {
  title: string;
  state: PaginatedSearch<TItem>;
  /** Renders one row: the feature's own item, with its own actions. */
  renderItem: (item: TItem) => React.ReactElement;
  getItemKey: (item: TItem) => string;
  placeholder: string;
  emptyMessage: string;
  testIds: SearchableHistoryTestIds;
}

/**
 * The searchable, infinitely scrolled listing shared by Chat History and
 * Session History. It owns the presentation only: the data, the filter state
 * and the page arithmetic come from `usePaginatedSearch`, and the rows come
 * from the caller, because what a row does is what differs between domains.
 */
export function SearchableHistory<TItem>({
  title,
  state,
  renderItem,
  getItemKey,
  placeholder,
  emptyMessage,
  testIds,
}: SearchableHistoryProps<TItem>) {
  const {
    items,
    hasMore,
    isLoading,
    filter,
    setFilter,
    scrollContainer,
    getItemProps,
  } = state;

  return (
    <div
      data-testid={testIds.container}
      className="w-full pb-6 max-w-4xl mx-auto"
    >
      <h1 className="text-2xl font-bold mb-6">{title}</h1>
      <div className="flex flex-col lg:flex-row gap-4 mb-8 items-center">
        <div className="relative flex-1 w-full">
          <Input
            data-testid={testIds.filter}
            className="pl-10"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={placeholder}
          />
          <SearchIcon className="absolute top-1/2 left-3 w-4 h-4 transform -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      <ul
        ref={scrollContainer}
        className="space-y-3 max-h-[70dvh] overflow-auto scrollbar-none"
        aria-label={testIds.list}
      >
        {items.map((item, idx) => {
          const { loaderRef } = getItemProps(idx);

          return (
            <Fragment key={getItemKey(item)}>
              {renderItem(item)}
              {loaderRef && (
                <li
                  ref={loaderRef}
                  className="h-px w-full opacity-0 pointer-events-none"
                  aria-hidden="true"
                />
              )}
            </Fragment>
          );
        })}
        {items.length === 0 && !isLoading && (
          <div className="text-center text-muted-foreground py-8">
            {emptyMessage}
          </div>
        )}
        {hasMore && isLoading && (
          <li className="h-8 w-full flex items-center justify-center text-muted-foreground text-sm">
            Loading more...
          </li>
        )}
      </ul>
    </div>
  );
}
