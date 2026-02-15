"use client";

import { useMemo } from "react";
import { Info, Book } from "lucide-react";
import { Streamdown } from "streamdown";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";

interface Context7SourceMessagePartProps {
  sources: { libraryId: string; output: string }[];
}

export const Context7SourceMessagePart: React.FC<
  Context7SourceMessagePartProps
> = ({ sources }) => {
  const uniqueSources = useMemo(() => {
    const map = new Map<string, string>();
    sources.forEach((source) => {
      // If multiple calls for same library, we take the last one or concatenate.
      // Here we choose to concatenate if needed, or just take the last valid one.
      // But typically queryDocs returns specific docs.
      // Let's concatenate if multiple contents for same libraryId to be safe,
      // or just keep them as separate entries if we want to show multiple "files".
      // The requirement says "deduplicas por libraryId".
      // So we will group by libraryId.
      if (map.has(source.libraryId)) {
        map.set(
          source.libraryId,
          map.get(source.libraryId) + "\n\n---\n\n" + source.output,
        );
      } else {
        map.set(source.libraryId, source.output);
      }
    });
    return Array.from(map.entries()).map(([libraryId, output]) => ({
      libraryId,
      output,
    }));
  }, [sources]);

  if (uniqueSources.length === 0) return null;

  return (
    <>
      <div className="flex flex-col space-y-2 text-sm pl-3 py-1 border-l-4 border-secondary overflow-hidden">
        {uniqueSources.map((source, idx) => (
          <Context7SourceItem key={idx} source={source} />
        ))}
      </div>
    </>
  );
};

const Context7SourceItem: React.FC<{
  source: { libraryId: string; output: string };
}> = ({ source }) => {
  const { getDropdownTriggerProps, getDropdownPopupProps } = useDropdown();

  return (
    <div className="flex items-center space-x-2 text-zinc-500 dark:text-zinc-400">
      <span className="flex items-center space-x-2 truncate">
        <span>
          <Book className="h-4 w-4" />
        </span>
        <span className="font-semibold truncate block" title={source.libraryId}>
          {source.libraryId}
        </span>
      </span>
      <Dropdown.Container>
        <button
          {...getDropdownTriggerProps()}
          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
          title="View Documentation"
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
              <h3
                className="font-semibold truncate pr-4"
                title={source.libraryId}
              >
                {source.libraryId}
              </h3>
            </div>
            <div className="flex-1 max-h-[50vh] overflow-auto p-4">
              <div className="prose dark:prose-invert max-w-none text-sm">
                <Streamdown>{source.output}</Streamdown>
              </div>
            </div>
          </div>
        </Dropdown.Popup>
      </Dropdown.Container>
    </div>
  );
};
