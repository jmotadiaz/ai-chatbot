"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Upload, FileText, Link as LinkIcon } from "lucide-react";
import { useUploadRagResources } from "@/lib/ai/hooks/use-upload-rag-resources";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const RAGUploadForm = () => {
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [container, setContainer] = useState("");
  const [excludeSelectors, setExcludeSelectors] = useState("");
  const { upload, isLoading } = useUploadRagResources();

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



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jsonFile && !url) {
      toast.error(
        "Please provide a source: a JSON file or a URL."
      );
      return;
    }

    try {
      const formData = new FormData();

      if (jsonFile) {
        formData.append("jsonFile", jsonFile);
      }

      if (url) {
        formData.append("url", url);
        if (container) formData.append("container", container);
        if (excludeSelectors)
          formData.append("excludeSelectors", excludeSelectors);
      }

      const result = await upload(formData);

      if (result.success) {
        setJsonFile(null);
        setUrl("");
        setContainer("");
        setExcludeSelectors("");
        const form = e.target as HTMLFormElement;
        form.reset();
      }
    } catch (error) {
      console.error("Error uploading RAG resources:", error);
      toast.error("An error occurred while uploading resources");
    }
  };

  return (
    <div className="w-full pb-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <Label className="mb-2" htmlFor="url">
            URL - Optional
          </Label>
          <div className="relative">
            <Input
              id="url"
              type="url"
              placeholder="https://example.com/article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
              className="pl-10"
            />
            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="container">Container Selector (Optional)</Label>
              <Input
                id="container"
                placeholder="e.g. article, #content"
                value={container}
                onChange={(e) => setContainer(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="excludeSelectors">
                Exclude Selectors (Optional)
              </Label>
              <Input
                id="excludeSelectors"
                placeholder="e.g. .ad, .sidebar"
                value={excludeSelectors}
                onChange={(e) => setExcludeSelectors(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Enter a single URL to scrape and process.
          </p>
        </div>
        <div className="relative flex items-center my-8">
          <div className="flex-grow border-t border-gray-300 dark:border-gray-700"></div>
          <span className="flex-shrink mx-4 text-xs text-gray-500 dark:text-gray-400">
            AND / OR
          </span>
          <div className="flex-grow border-t border-gray-300 dark:border-gray-700"></div>
        </div>
        <div className="space-y-4">
          <Label className="mb-2" htmlFor="jsonFile">
            JSON File (URLs) - Optional
          </Label>
          <div className="relative">
            <Input
              id="jsonFile"
              type="file"
              accept=".json"
              onChange={handleJsonFileChange}
              disabled={isLoading}
              className="file:mr-4 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/20 dark:file:text-blue-400 border-none shadow-none px-0 py-2 cursor-pointer file:cursor-pointer"
            />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Expected format:{" "}
            {'{ "urls": ["https://example.com", "https://example2.com"] }'}
          </p>
        </div>


        {url && (
          <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-900/20 rounded-lg">
            <LinkIcon className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold truncate">{url}</span>
          </div>
        )}

        {jsonFile && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold">{jsonFile.name}</span>
            <span className="text-xs text-gray-500">
              ({(jsonFile.size / 1024).toFixed(1)} KB)
            </span>
          </div>
        )}



        <div className="text-right mt-4">
          <Button
            type="submit"
            disabled={(!jsonFile && !url) || isLoading}
            isLoading={isLoading}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload and Process
          </Button>
        </div>
      </form>
    </div>
  );
};
