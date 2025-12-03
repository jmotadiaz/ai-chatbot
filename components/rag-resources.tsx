"use client";

import { useState, useTransition, useCallback, Fragment } from "react";
import { toast } from "sonner";
import { SearchIcon } from "lucide-react";
import { RagResourceItem } from "./rag-resource-item";
import { deleteAllResources, deleteResource } from "@/lib/ai/actions/rag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmModal, useConfirmModal } from "@/components/ui/confirm-modal";
import { useIntersectionObserver } from "@/lib/hooks/intersection";
import { normalize, toWords } from "@/lib/utils";

interface Resource {
  title: string;
  url: string | null;
}

interface RAGResourcesProps {
  resources: Resource[];
}

const ITEMS_PER_PAGE = 20;
const ITEMS_TO_TRIGGER_PAGINATION = 10;

export const RAGResources: React.FC<RAGResourcesProps> = ({ resources }) => {
  const [isLoading, startTransition] = useTransition();
  const [filter, setFilter] = useState("");
  const { modalProps, triggerModalProps } = useConfirmModal();
  const [offset, setOffset] = useState(ITEMS_PER_PAGE);
  const onIntersect = useCallback(() => {
    setOffset((prev) => prev + ITEMS_PER_PAGE);
  }, []);
  const { loader, scrollContainer } = useIntersectionObserver<
    HTMLUListElement,
    HTMLLIElement
  >({
    onIntersect,
  });

  const handleDeleteResource = (title: string) => {
    startTransition(async () => {
      try {
        const result = await deleteResource(title);
        if (result.success) {
          toast.success(`Resource "${title}" deleted successfully`);
        } else {
          toast.error(result.error || "Failed to delete resource");
        }
      } catch (error) {
        console.error("Error deleting resource:", error);
        toast.error("An error occurred while deleting the resource");
      }
    });
  };

  const handleDeleteAllResources = () => {
    startTransition(async () => {
      try {
        const result = await deleteAllResources();
        if (result.success) {
          toast.success("All resources deleted successfully");
        } else {
          toast.error(result.error || "Failed to delete all resources");
        }
      } catch (error) {
        console.error("Error deleting all resources:", error);
        toast.error("An error occurred while deleting all resources");
      }
    });
  };

  const normalizedFilter = normalize(filter);

  const filteredResources =
    normalizedFilter.length === 0
      ? resources
      : resources.filter(({ title }) => {
          const normalizedTitle = normalize(title);
          return toWords(normalizedFilter).every((word) =>
            normalizedTitle.includes(word)
          );
        });

  return (
    <div className="w-full pb-6">
      <div className="flex flex-col lg:flex-row gap-4 mb-8 items-center">
        <div className="relative flex-1 w-full">
          <Input
            className="pl-10"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter resources..."
          />
          <SearchIcon className="absolute top-1/2 left-3 w-4 h-4 transform -translate-y-1/2 text-muted-foreground" />
        </div>
        <Button
          className="flex-1 w-full"
          variant="destructive"
          disabled={isLoading}
          {...triggerModalProps()}
        >
          Delete {normalizedFilter.length > 0 ? "Selection" : "All"}
        </Button>
      </div>
      <ConfirmModal
        {...modalProps()}
        onConfirm={handleDeleteAllResources}
        isLoading={isLoading}
        title="Delete All Resources"
        message="Are you sure you want to delete all resources? This action cannot be undone."
      />
      <ul
        ref={scrollContainer}
        className="space-y-3 max-h-[70dvh] overflow-auto scrollbar-none"
      >
        {filteredResources.slice(0, offset).map((resource, idx) => (
          <Fragment key={resource.title}>
            <RagResourceItem
              resource={resource}
              isLoading={isLoading}
              onDelete={handleDeleteResource}
            />
            {idx === offset - ITEMS_TO_TRIGGER_PAGINATION &&
              offset < filteredResources.length && (
                <li
                  ref={loader}
                  className="h-px w-full opacity-0 pointer-events-none"
                  aria-hidden="true"
                />
              )}
          </Fragment>
        ))}
      </ul>
    </div>
  );
};
