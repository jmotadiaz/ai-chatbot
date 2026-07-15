"use client";

import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/helpers";

export interface BreadcrumbsProps {
  rootLabel: string;
  pathStack: string[];
  onNavigate: (length: number) => void; // 0 = project root
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  rootLabel,
  pathStack,
  onNavigate,
}) => {
  const crumbs = [rootLabel, ...pathStack];
  return (
    <nav
      aria-label="Current folder"
      className="flex items-center overflow-x-auto scrollbar-none whitespace-nowrap px-2 border-b border-zinc-200 dark:border-zinc-800"
    >
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <Fragment key={`${idx}-${crumb}`}>
            {idx > 0 && (
              <ChevronRight
                size={14}
                className="shrink-0 text-zinc-400 dark:text-zinc-500"
              />
            )}
            <button
              type="button"
              disabled={isLast}
              onClick={() => onNavigate(idx)}
              className={cn(
                "min-h-11 px-1.5 text-sm cursor-pointer",
                isLast
                  ? "font-semibold cursor-default"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200",
              )}
            >
              {crumb}
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
};
