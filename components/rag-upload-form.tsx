"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Upload, FileText } from "lucide-react";
import { uploadRAGResources } from "@/lib/ai/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const RAGUploadForm = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== "application/json") {
        toast.error("Please select a JSON file");
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      toast.error("Please select a file");
      return;
    }

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const result = await uploadRAGResources(formData);

      if (result.success) {
        toast.success(
          `Successfully processed ${result.resourcesCreated} resources with ${result.embeddingsCreated} embeddings`
        );
        setFile(null);
        // Reset form
        const form = e.target as HTMLFormElement;
        form.reset();
      } else {
        toast.error(result.error || "Failed to process resources");
      }
    } catch (error) {
      console.error("Error uploading RAG resources:", error);
      toast.error("An error occurred while uploading resources");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <Label htmlFor="file">JSON File</Label>
          <div className="relative">
            <Input
              id="file"
              type="file"
              accept=".json"
              onChange={handleFileChange}
              disabled={isLoading}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/20 dark:file:text-blue-400"
            />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Expected format:{" "}
            {'{ "urls": ["https://example.com", "https://example2.com"] }'}
          </p>
        </div>

        {file && (
          <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium">{file.name}</span>
            <span className="text-xs text-gray-500">
              ({(file.size / 1024).toFixed(1)} KB)
            </span>
          </div>
        )}

        <Button type="submit" disabled={!file || isLoading} className="w-full">
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Processing...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Upload and Process
            </>
          )}
        </Button>
      </form>
    </div>
  );
};
