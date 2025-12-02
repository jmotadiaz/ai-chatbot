
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface UploadRagResourcesResult {
  success: boolean;
  resourcesCreated?: number;
  error?: string;
}

export function useUploadRagResources() {
  const [isLoading, startTransition] = useTransition();
  const router = useRouter();

  const upload = (formData: FormData) => {
    return new Promise<UploadRagResourcesResult>((resolve) => {
      startTransition(async () => {
        try {
          const response = await fetch("/api/rag/upload", {
            method: "POST",
            body: formData,
          });

          const result = await response.json();

          if (response.ok && result.success) {
            toast.success(
              `Successfully processed ${result.resourcesCreated} resources`
            );
            router.refresh();
            resolve({ success: true, resourcesCreated: result.resourcesCreated });
          } else {
            const error = result.error || "Failed to process resources";
            toast.error(error);
            resolve({ success: false, error });
          }
        } catch (error) {
          console.error("Error uploading RAG resources:", error);
          const errorMessage = "An error occurred while uploading resources";
          toast.error(errorMessage);
          resolve({ success: false, error: errorMessage });
        }
      });
    });
  };

  return {
    upload,
    isLoading,
  };
}
