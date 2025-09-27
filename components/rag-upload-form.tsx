"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload, FileText, Link as LinkIcon } from "lucide-react";
import { uploadResources } from "@/lib/ai/actions/rag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const RAGUploadForm = () => {
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [markdownFiles, setMarkdownFiles] = useState<FileList | null>(null);
  const [url, setUrl] = useState("");
  const [isLoading, startTransition] = useTransition();

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jsonFile && !markdownFiles && !url) {
      toast.error(
        "Please provide a source: a JSON file, markdown files, or a URL."
      );
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();

        if (jsonFile) {
          formData.append("jsonFile", jsonFile);
        }

        if (markdownFiles) {
          Array.from(markdownFiles).forEach((file, index) => {
            formData.append(`markdownFile_${index}`, file);
          });
          formData.append(
            "markdownFilesCount",
            markdownFiles.length.toString()
          );
        }
        if (url) {
          formData.append("url", url);
        }

        const result = await uploadResources(formData);

        if (result.success) {
          toast.success(
            `Successfully processed ${result.resourcesCreated} resources with ${result.embeddingsCreated} embeddings`
          );
          setJsonFile(null);
          setMarkdownFiles(null);
          setUrl("");
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
        <div className="relative flex items-center my-8">
          <div className="flex-grow border-t border-gray-300 dark:border-gray-700"></div>
          <span className="flex-shrink mx-4 text-xs text-gray-500 dark:text-gray-400">
            AND / OR
          </span>
          <div className="flex-grow border-t border-gray-300 dark:border-gray-700"></div>
        </div>
        <div className="space-y-4">
          <Label className="mb-2" htmlFor="markdownFiles">
            Markdown Files - Optional
          </Label>
          <div className="relative">
            <Input
              id="markdownFiles"
              type="file"
              accept=".md, .mdx"
              multiple
              onChange={handleMarkdownFilesChange}
              disabled={isLoading}
              className="file:mr-4 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 dark:file:bg-green-900/20 dark:file:text-green-400 border-none shadow-none px-0 py-2 cursor-pointer file:cursor-pointer"
            />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Select multiple .md or .mdx files to upload directly.
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

        {markdownFiles && markdownFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Selected markdown files ({markdownFiles.length}):
            </p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {Array.from(markdownFiles).map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg"
                >
                  <FileText className="w-3 h-3 text-green-500" />
                  <span className="text-xs font-semibold">{file.name}</span>
                  <span className="text-xs text-gray-500">
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-right mt-4">
          <Button
            type="submit"
            disabled={(!jsonFile && !markdownFiles && !url) || isLoading}
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
