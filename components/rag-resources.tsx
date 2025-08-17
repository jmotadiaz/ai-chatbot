"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteResource } from "@/lib/ai/actions/rag";
import { Button } from "@/components/ui/button";

interface Resource {
  title: string;
}

interface RAGResourcesProps {
  resources: Resource[];
}

export const RAGResources: React.FC<RAGResourcesProps> = ({ resources }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async (title: string) => {
    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
      <h2 className="text-lg font-semibold mb-4">Your Resources</h2>
      {isLoading && <p>Loading resources...</p>}
      {!isLoading && resources.length === 0 && <p>No resources found.</p>}
      <ul className="space-y-2">
        {resources.map((resource) => (
          <li
            key={resource.title}
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/20 rounded-lg"
          >
            <span className="truncate">{resource.title}</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleDelete(resource.title)}
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
