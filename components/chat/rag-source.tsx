"use client";

import { useMemo } from "react";
import { useCollapse } from "react-collapsed";
import { SourceDocumentItem } from "./source-document-item";
import { RagChunk } from "@/lib/features/rag/types";

interface RagSourceMessagePartProps {
  ragSourceParts: RagChunk[][];
  isExpanded: boolean;
}

export const RagSourceMessagePart: React.FC<RagSourceMessagePartProps> = ({
  ragSourceParts,
  isExpanded,
}) => {
  const { getCollapseProps } = useCollapse({ isExpanded });

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
    <div {...getCollapseProps()}>
      <div className="py-2 pl-2">
        <div className="flex flex-col space-y-2 text-sm pl-3 py-1 border-l-4 border-secondary overflow-hidden">
          {groupedSources.map((source, idx) => (
            <SourceDocumentItem
              key={idx}
              title={source.title}
              url={source.url}
              content={source.content.join("\n\n---\n\n")}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
