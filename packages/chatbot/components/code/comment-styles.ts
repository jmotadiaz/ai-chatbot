import { cn } from "@/lib/utils/helpers";

/**
 * Shared comment treatments for the "technical review" direction: compact
 * geometry, slate status colours and a left rule on the selected anchor.
 * Keeping them here stops Markdown preview and Agent response from drifting.
 */
export function commentableBlockClass(
  hasComment: boolean,
  isSelected: boolean,
): string {
  return cn(
    "group relative -mx-3 cursor-pointer rounded-[5px] border border-transparent px-3 py-2 pr-10 transition-colors focus-visible:border-slate-500 focus-visible:outline-none dark:focus-visible:border-slate-400",
    !isSelected &&
      "[&:hover:not(:has([data-comment-anchor]:hover)):not(:has([data-comment-composer]:hover))]:bg-zinc-100/80 dark:[&:hover:not(:has([data-comment-anchor]:hover)):not(:has([data-comment-composer]:hover))]:bg-zinc-900/70",
    hasComment &&
      "border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/35",
    isSelected && "pr-3",
  );
}

export function commentMarkerClass(
  hasComment: boolean,
  isSelected: boolean,
): string {
  return cn(
    "absolute right-1 top-2 rounded-[4px] border border-zinc-200 bg-(--background) p-1 text-zinc-500 opacity-0 shadow-none transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:border-zinc-700",
    hasComment &&
      "border-slate-300 bg-slate-50 text-slate-600 opacity-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300",
    isSelected && "hidden",
  );
}

export function commentRowClass(
  hasComment: boolean,
  _isSelected?: boolean,
): string {
  return cn(
    "cursor-pointer transition-colors [&:hover:not(:has([data-comment-anchor]:hover)):not(:has([data-comment-composer]:hover))]:bg-zinc-100/80 dark:[&:hover:not(:has([data-comment-anchor]:hover)):not(:has([data-comment-composer]:hover))]:bg-zinc-900/70",
    hasComment && "bg-slate-500/10",
  );
}

export const COMMENTED_CODE_LINE_CLASSES = [
  "bg-slate-500/10",
  "dark:bg-slate-400/10",
] as const;

export const SELECTED_CODE_LINE_CLASSES: readonly string[] = [];
