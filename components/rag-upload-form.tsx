"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Upload, FileText } from "lucide-react";
import { uploadResources } from "@/lib/ai/actions/rag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const RAGUploadForm = () => {
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [markdownFiles, setMarkdownFiles] = useState<FileList | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== "application/json") {
        toast.error("Please select a JSON file");
        return;
      }
      setJsonFile(selectedFile);
    }
  };

  const handleMarkdownFilesChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      // Validate that all files are markdown
      const invalidFiles = Array.from(selectedFiles).filter(
        (file) => !file.name.match(/\.(md|mdx)$/i)
      );

      if (invalidFiles.length > 0) {
        toast.error("Please select only .md or .mdx files");
        return;
      }

      setMarkdownFiles(selectedFiles);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!jsonFile && !markdownFiles) {
      toast.error(
        "Please select either a JSON file with URLs or markdown files"
      );
      return;
    }

    setIsLoading(true);

    try {
      const formData = new FormData();

      if (jsonFile) {
        formData.append("jsonFile", jsonFile);
      }

      if (markdownFiles) {
        Array.from(markdownFiles).forEach((file, index) => {
          formData.append(`markdownFile_${index}`, file);
        });
        formData.append("markdownFilesCount", markdownFiles.length.toString());
      }

      const result = await uploadResources(formData);

      if (result.success) {
        toast.success(
          `Successfully processed ${result.resourcesCreated} resources with ${result.embeddingsCreated} embeddings`
        );
        setJsonFile(null);
        setMarkdownFiles(null);
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
          <Label htmlFor="jsonFile">JSON File (URLs) - Optional</Label>
          <div className="relative">
            <Input
              id="jsonFile"
              type="file"
              accept=".json"
              onChange={handleJsonFileChange}
              disabled={isLoading}
              className="file:mr-4 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/20 dark:file:text-blue-400 border-none px-0 py-2 cursor-pointer file:cursor-pointer"
            />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Expected format:{" "}
            {'{ "urls": ["https://example.com", "https://example2.com"] }'}
          </p>
        </div>

        <div className="space-y-4">
          <Label htmlFor="markdownFiles">Markdown Files - Optional</Label>
          <div className="relative">
            <Input
              id="markdownFiles"
              type="file"
              accept=".md"
              multiple
              onChange={handleMarkdownFilesChange}
              disabled={isLoading}
              className="file:mr-4 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100 dark:file:bg-green-900/20 dark:file:text-green-400 border-none px-0 py-2 cursor-pointer file:cursor-pointer"
            />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Select multiple .md files to upload directly
          </p>
        </div>

        {jsonFile && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium">{jsonFile.name}</span>
            <span className="text-xs text-gray-500">
              ({(jsonFile.size / 1024).toFixed(1)} KB)
            </span>
          </div>
        )}

        {markdownFiles && markdownFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Selected markdown files ({markdownFiles.length}):
            </p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {Array.from(markdownFiles).map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg"
                >
                  <FileText className="w-3 h-3 text-green-500" />
                  <span className="text-xs font-medium">{file.name}</span>
                  <span className="text-xs text-gray-500">
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button
          type="submit"
          disabled={(!jsonFile && !markdownFiles) || isLoading}
          className="w-full mt-4"
        >
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
