"use client";

import React, { memo } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

import { type UIResource as RagResource } from "@/lib/features/rag/types";

interface RagResourceItemProps {
  resource: RagResource;
  isDeleting?: boolean;
  onDelete?: (resource: RagResource) => void;
  loaderRef?: React.RefCallback<HTMLLIElement>;
}

export const RagResourceItem: React.FC<RagResourceItemProps> = memo(
  ({ resource, isDeleting, onDelete, loaderRef }) => {
    return (
      <li
        ref={loaderRef}
        className="flex items-center justify-between p-3 bg-secondary rounded-lg"
      >
        <>
          {!!resource.url ? (
            <a
              className="truncate cursor-pointer hover:underline"
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {resource.title}
            </a>
          ) : (
            <span className="truncate">{resource.title}</span>
          )}
        </>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDelete?.(resource)}
          disabled={isDeleting}
          aria-label={`Delete resource ${resource.title}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </li>
    );
  },
);

RagResourceItem.displayName = "RagResourceItem";
