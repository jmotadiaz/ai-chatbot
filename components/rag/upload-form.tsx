"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload, FileSearch, Link as LinkIcon } from "lucide-react";
import { uploadResources } from "@/lib/features/rag/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RAGUploadFormProps {
  projectId?: string;
}

export const RAGUploadForm = ({ projectId }: RAGUploadFormProps) => {
  const [jsonFiles, setJsonFiles] = useState<File[]>([]);
  const [markdownFiles, setMarkdownFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [container, setContainer] = useState("");
  const [excludeSelectors, setExcludeSelectors] = useState("");
  const [isLoading, startTransition] = useTransition();

  const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const validFiles: File[] = [];
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        if (file.type !== "application/json") {
          toast.error(`File ${file.name} is not a JSON file`);
          continue;
        }
        validFiles.push(file);
      }
      setJsonFiles(validFiles);
    }
  };

  const handleMarkdownFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const validFiles: File[] = [];
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        if (!file.name.toLowerCase().endsWith(".md")) {
          toast.error(`File ${file.name} is not a Markdown file`);
          continue;
        }
        validFiles.push(file);
      }
      setMarkdownFiles(validFiles);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (jsonFiles.length === 0 && markdownFiles.length === 0 && !url) {
      toast.error(
        "Please provide a source: JSON file(s), Markdown file(s), or a URL.",
      );
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();

        if (jsonFiles.length > 0) {
          jsonFiles.forEach((file) => {
            formData.append("jsonFile", file);
          });
        }

        if (markdownFiles.length > 0) {
          markdownFiles.forEach((file) => {
            formData.append("markdownFile", file);
          });
        }

        if (url) {
          formData.append("url", url);
          if (container) formData.append("container", container);
          if (excludeSelectors)
            formData.append("excludeSelectors", excludeSelectors);
        }

        if (projectId) {
          formData.append("projectId", projectId);
        }

        const result = await uploadResources(formData);

        if (result.success) {
          toast.success(
            `Successfully processed ${result.resourcesCreated} resources`,
          );
          setJsonFiles([]);
          setMarkdownFiles([]);
          setUrl("");
          setContainer("");
          setExcludeSelectors("");
          const form = e.target as HTMLFormElement;
          form.reset();
        } else {
          toast.error(result.error || "Failed to process resources");
        }
      } catch (error) {
        console.error("Error uploading RAG resources:", error);
        toast.error("An error occurred while uploading resources");
      }
    });
  };

  return (
    <div className="w-full pb-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <Label className="mb-2" htmlFor="url">
            URL
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
              <Label htmlFor="container">Container Selector</Label>
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
                Exclude Selectors
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
            JSON File(s) (URLs)
          </Label>
          <div className="relative">
            <Input
              id="jsonFile"
              type="file"
              accept=".json"
              multiple
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
        <div className="relative flex items-center my-8">
          <div className="flex-grow border-t border-gray-300 dark:border-gray-700"></div>
          <span className="flex-shrink mx-4 text-xs text-gray-500 dark:text-gray-400">
            AND / OR
          </span>
          <div className="flex-grow border-t border-gray-300 dark:border-gray-700"></div>
        </div>
        <div className="space-y-4">
          <Label className="mb-2" htmlFor="markdownFile">
            Markdown File(s)
          </Label>
          <div className="relative">
            <Input
              id="markdownFile"
              type="file"
              accept=".md,.markdown"
              multiple
              onChange={handleMarkdownFileChange}
              disabled={isLoading}
              className="file:mr-4 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 dark:file:bg-purple-900/20 dark:file:text-purple-400 border-none shadow-none px-0 py-2 cursor-pointer file:cursor-pointer"
            />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Upload one or more Markdown files (.md) to be processed directly.
          </p>
        </div>

        {url && (
          <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-900/20 rounded-lg">
            <LinkIcon className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold truncate">{url}</span>
          </div>
        )}

        {jsonFiles.length > 0 && (
          <div className="space-y-2">
            {jsonFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
              >
                <FileSearch className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold">{file.name}</span>
                <span className="text-xs text-gray-500">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            ))}
          </div>
        )}

        {markdownFiles.length > 0 && (
          <div className="space-y-2">
            {markdownFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg"
              >
                <FileSearch className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-semibold">{file.name}</span>
                <span className="text-xs text-gray-500">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="text-right mt-4">
          <Button
            type="submit"
            disabled={
              (jsonFiles.length === 0 && markdownFiles.length === 0 && !url) ||
              isLoading
            }
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
