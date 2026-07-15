"use client";

import type { FileBrowserScope } from "./types";
import { cn } from "@/lib/utils/helpers";

const TABS: { id: FileBrowserScope; label: string }[] = [
  { id: "last-turn", label: "Last turn" },
  { id: "uncommitted", label: "Uncommitted" },
  { id: "tree", label: "All files" },
];

export interface ScopeTabsProps {
  scope: FileBrowserScope;
  onScopeChange: (scope: FileBrowserScope) => void;
  disabledScopes?: FileBrowserScope[];
  disabledReason?: string;
}

export const ScopeTabs: React.FC<ScopeTabsProps> = ({
  scope,
  onScopeChange,
  disabledScopes = [],
  disabledReason,
}) => (
  <div
    role="tablist"
    aria-label="File browser scope"
    className="flex flex-1 gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1"
  >
    {TABS.map((tab) => {
      const disabled = disabledScopes.includes(tab.id);
      return (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-selected={scope === tab.id}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          onClick={() => onScopeChange(tab.id)}
          className={cn(
            "flex-1 min-h-9 rounded-md px-2 text-sm font-medium transition-colors cursor-pointer",
            scope === tab.id
              ? "bg-white dark:bg-zinc-600 shadow-sm"
              : "text-zinc-500 dark:text-zinc-400",
            disabled && "opacity-40 cursor-not-allowed",
          )}
        >
          {tab.label}
        </button>
      );
    })}
  </div>
);
