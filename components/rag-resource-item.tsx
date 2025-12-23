"use client";

import React, { memo } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RagResourceItemProps {
  resource: {
    title: string;
    url: string | null;
  };
  isLoading: boolean;
  onDelete: (title: string) => void;
}

export const RagResourceItem: React.FC<RagResourceItemProps> = memo(
  ({ resource, isLoading, onDelete }) => {
    return (
      <li className="flex items-center justify-between p-3 bg-secondary rounded-lg">
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
          onClick={() => onDelete(resource.title)}
          disabled={isLoading}
          aria-label={`Delete resource ${resource.title}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </li>
    );
  }
);

RagResourceItem.displayName = "RagResourceItem";
