import React from "react";

const RAGSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto p-6 px-4 pt-28">
      <div className="h-10 bg-gray-200 dark:bg-zinc-700 rounded-md w-1/3 animate-pulse mb-6" />

      <div className="w-full">
        <div className="h-10 bg-gray-200 dark:bg-zinc-700 rounded-md w-1/2 animate-pulse" />
        <div className="mt-8 px-4">
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="h-6 bg-gray-200 dark:bg-zinc-700 rounded-md w-1/4 animate-pulse" />
              <div className="h-10 bg-gray-200 dark:bg-zinc-700 rounded-md w-full animate-pulse" />
            </div>
            <div className="h-px bg-gray-200 dark:bg-zinc-700 w-full animate-pulse" />
            <div className="space-y-4">
              <div className="h-6 bg-gray-200 dark:bg-zinc-700 rounded-md w-1/4 animate-pulse" />
              <div className="h-10 bg-gray-200 dark:bg-zinc-700 rounded-md w-full animate-pulse" />
            </div>
            <div className="h-px bg-gray-200 dark:bg-zinc-700 w-full animate-pulse" />
            <div className="space-y-4">
              <div className="h-6 bg-gray-200 dark:bg-zinc-700 rounded-md w-1/4 animate-pulse" />
              <div className="h-10 bg-gray-200 dark:bg-zinc-700 rounded-md w-full animate-pulse" />
            </div>
            <div className="text-right mt-4">
              <div className="h-10 bg-gray-200 dark:bg-zinc-700 rounded-md w-1/4 ml-auto animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RAGSkeleton;
