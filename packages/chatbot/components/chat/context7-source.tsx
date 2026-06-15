"use client";

import { useMemo } from "react";
import { useCollapse } from "react-collapsed";
import { SourceDocumentItem } from "./source-document-item";

interface Context7SourceMessagePartProps {
  sources: { libraryId: string; output: string }[];
  isExpanded: boolean;
}

export const Context7SourceMessagePart: React.FC<
  Context7SourceMessagePartProps
> = ({ sources, isExpanded }) => {
  const { getCollapseProps } = useCollapse({ isExpanded });

  const uniqueSources = useMemo(() => {
    const map = new Map<string, string>();
    sources.forEach((source) => {
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
    <div {...getCollapseProps()}>
      <div className="py-2 pl-2">
        <div className="flex flex-col space-y-2 text-sm pl-3 py-1 border-l-4 border-secondary overflow-hidden">
          {uniqueSources.map((source, idx) => (
            <SourceDocumentItem
              key={idx}
              title={source.libraryId}
              content={source.output}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
