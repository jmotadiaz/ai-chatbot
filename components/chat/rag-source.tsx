"use client";

import { useMemo } from "react";
import { Info, Book, LinkIcon } from "lucide-react";
import { Streamdown } from "streamdown";
import { RagChunk } from "@/lib/features/rag/types";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";

interface RagSourceMessagePartProps {
  ragSourceParts: RagChunk[][];
}

export const RagSourceMessagePart: React.FC<RagSourceMessagePartProps> = ({
  ragSourceParts,
}) => {
  const groupedSources = useMemo(() => {
    const groups = new Map<
      string,
      { title: string; url?: string; content: string[] }
    >();

    ragSourceParts.flat().forEach((chunk) => {
      // Use URL or Title as key for grouping
      const key = chunk.resourceUrl || chunk.resourceTitle;

      if (!groups.has(key)) {
        groups.set(key, {
          title: chunk.resourceTitle,
          url: chunk.resourceUrl ?? undefined,
          content: [],
        });
      }

      const group = groups.get(key)!;
      // Add content if present
      if (chunk.content) {
        group.content.push(chunk.content);
      }
    });

    return Array.from(groups.values());
  }, [ragSourceParts]);

  if (groupedSources.length === 0) return null;

  return (
    <>
      <div className="flex flex-col space-y-2 text-sm pl-3 py-1 border-l-4 border-secondary overflow-hidden">
        {groupedSources.map((source, idx) => (
          <RagSourceItem key={idx} source={source} />
        ))}
      </div>
    </>
  );
};

const RagSourceItem: React.FC<{
  source: { title: string; url?: string; content: string[] };
}> = ({ source }) => {
  const { getDropdownTriggerProps, getDropdownPopupProps } = useDropdown();

  const combinedContent = source.content.join("\n\n---\n\n");

  return (
    <div className="flex items-center space-x-2 text-zinc-500 dark:text-zinc-400">
      <span className="flex items-center space-x-2 truncate">
        <span>
          {source.url ? (
            <LinkIcon className="h-4 w-4" />
          ) : (
            <Book className="h-4 w-4" />
          )}
        </span>
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold hover:underline cursor-pointer truncate block"
            title="View Source URL"
          >
            {source.title || source.url}
          </a>
        ) : (
          <span className="font-semibold truncate block" title={source.title}>
            {source.title}
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
          className="lg:w-[600px] flex flex-col"
        >
          <div className="flex flex-col h-full bg-background dark:bg-zinc-900 overflow-hidden rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
              <h3 className="font-semibold truncate pr-4" title={source.title}>
                {source.title}
              </h3>
              {source.url && (
                <a
                  href={source.url}
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
                <Streamdown>{combinedContent}</Streamdown>
              </div>
            </div>
          </div>
        </Dropdown.Popup>
      </Dropdown.Container>
    </div>
  );
};
