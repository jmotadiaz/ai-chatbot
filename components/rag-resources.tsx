"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SearchIcon, Trash2 } from "lucide-react";
import { deleteAllResources, deleteResource } from "@/lib/ai/actions/rag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmModal, useConfirmModal } from "@/components/ui/confirm-modal";

interface Resource {
  title: string;
}

interface RAGResourcesProps {
  resources: Resource[];
}

export const RAGResources: React.FC<RAGResourcesProps> = ({ resources }) => {
  const [isLoading, startTransition] = useTransition();
  const [filter, setFilter] = useState("");
  const { modalProps, triggerModalProps } = useConfirmModal();

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

  return (
    <div className="w-full pb-6">
      <h2 className="text-lg font-semibold ml-2">Your Resources</h2>
      <div className="px-4 flex flex-col lg:flex-row gap-4 my-8 items-center">
        <div className="relative flex-1 w-full">
          <Input
            className="pl-10"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <SearchIcon className="absolute top-1/2 left-3 w-4 h-4 transform -translate-y-1/2 text-muted-foreground" />
        </div>
        <Button
          className="flex-1 w-full"
          variant="destructive"
          disabled={isLoading}
          {...triggerModalProps()}
        >
          Delete All
        </Button>
      </div>
      <ConfirmModal
        {...modalProps()}
        onConfirm={() => {
          handleDeleteAllResources();
        }}
        title="Delete All Resources"
        message={`Are you sure you want to delete all resources? This action cannot be undone.`}
      />
      <ul className="px-4 space-y-3 max-h-[70dvh] overflow-auto">
        {resources
          .filter(
            ({ title }) =>
              filter.trim().length === 0 ||
              title.toLowerCase().includes(filter.trim().toLocaleLowerCase())
          )
          .map((resource) => (
            <li
              key={resource.title}
              className="flex items-center justify-between p-3 bg-secondary rounded-lg"
            >
              <span className="truncate">{resource.title}</span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDeleteResource(resource.title)}
                disabled={isLoading}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </li>
          ))}
      </ul>
    </div>
  );
};
