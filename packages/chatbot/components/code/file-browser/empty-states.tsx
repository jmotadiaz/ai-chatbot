"use client";

import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";

export interface FileBrowserEmptyStateProps {
  Icon: ComponentType<LucideProps>;
  title: string;
  description?: string;
}

export const FileBrowserEmptyState: React.FC<FileBrowserEmptyStateProps> = ({
  Icon,
  title,
  description,
}) => (
  <div className="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
    <Icon size={32} className="text-zinc-300 dark:text-zinc-600" />
    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{title}</p>
    {description && (
      <p className="text-xs text-zinc-400 dark:text-zinc-500">{description}</p>
    )}
  </div>
);
