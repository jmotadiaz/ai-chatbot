import type * as React from "react";
import { cn } from "@/lib/utils/helpers";

export interface ProjectOverviewContainerProps {
  children: React.ReactNode;
  className?: string;
}

export type ProjectOverviewSize = "default" | "compact";

export interface ProjectOverviewTitleProps {
  children: React.ReactNode;
  className?: string;
  size?: ProjectOverviewSize;
}

export interface ProjectOverviewSubtitleProps {
  children: React.ReactNode;
  className?: string;
  size?: ProjectOverviewSize;
}

interface ProjectOverviewComponent {
  Container: React.FC<ProjectOverviewContainerProps>;
  Title: React.FC<ProjectOverviewTitleProps>;
  Subtitle: React.FC<ProjectOverviewSubtitleProps>;
}

const ProjectOverviewContainer: React.FC<ProjectOverviewContainerProps> = ({
  children,
  className,
}) => {
  return (
    <div
      className={cn(
        "h-full flex flex-col items-center justify-end px-4",
        className,
      )}
    >
      {children}
    </div>
  );
};

const ProjectOverviewTitle: React.FC<ProjectOverviewTitleProps> = ({
  children,
  className,
  size = "default",
}) => {
  const titleClassName =
    size === "compact"
      ? "text-lg font-medium mb-2"
      : "text-3xl font-semibold mb-4";

  return (
    <h1
      className={cn(
        "text-center select-none max-w-full",
        titleClassName,
        className,
      )}
    >
      <span className="flex max-w-full flex-wrap items-center justify-center gap-2 text-balance break-words">
        {children}
      </span>
    </h1>
  );
};

const ProjectOverviewSubtitle: React.FC<ProjectOverviewSubtitleProps> = ({
  children,
  className,
  size = "default",
}) => {
  return (
    <span
      className={cn(
        "block basis-full font-normal text-zinc-500 dark:text-zinc-400",
        size === "compact" ? "text-sm mt-1" : "text-base",
        className,
      )}
    >
      {children}
    </span>
  );
};

export const ProjectOverview: ProjectOverviewComponent = {
  Container: ProjectOverviewContainer,
  Title: ProjectOverviewTitle,
  Subtitle: ProjectOverviewSubtitle,
};
