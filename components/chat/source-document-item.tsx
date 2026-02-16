"use client";

import React from "react";
import { Info, Book, LinkIcon } from "lucide-react";
import { Streamdown } from "streamdown";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";

interface SourceDocumentItemProps {
  title: string;
  content: string;
  url?: string;
}

export const SourceDocumentItem: React.FC<SourceDocumentItemProps> = ({
  title,
  content,
  url,
}) => {
  const { getDropdownTriggerProps, getDropdownPopupProps } = useDropdown();

  return (
    <div className="flex items-center space-x-2 text-zinc-500 dark:text-zinc-400">
      <span className="flex items-center space-x-2 truncate">
        <span>
          {url ? (
            <LinkIcon className="h-4 w-4" />
          ) : (
            <Book className="h-4 w-4" />
          )}
        </span>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold hover:underline cursor-pointer truncate block"
            title="View Source URL"
          >
            {title || url}
          </a>
        ) : (
          <span className="font-semibold truncate block" title={title}>
            {title}
          </span>
        )}
      </span>
      <Dropdown.Container>
        <button
          {...getDropdownTriggerProps()}
          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
          title="View Source Content"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
        <Dropdown.Popup
          {...getDropdownPopupProps()}
          variant="responsive-center"
          className="lg:w-[600px] flex flex-col pb-0"
        >
          <div className="flex flex-col h-full bg-background dark:bg-zinc-900 overflow-hidden rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
              <h3 className="font-semibold truncate pr-4" title={title}>
                {title}
              </h3>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <LinkIcon className="h-4 w-4" />
                </a>
              )}
            </div>
            <div className="flex-1 max-h-[50vh] overflow-auto p-4">
              <div className="prose dark:prose-invert max-w-none text-sm">
                <Streamdown>{content}</Streamdown>
              </div>
            </div>
          </div>
        </Dropdown.Popup>
      </Dropdown.Container>
    </div>
  );
};
