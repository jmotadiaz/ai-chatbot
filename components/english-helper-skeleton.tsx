import React from "react";

const EnglishHelperSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col w-full h-full overflow-y-auto xl:overflow-hidden pt-18 px-4">
      <div className="w-full h-full flex-1 max-w-[2048px] mx-auto">
        {/* Tabs for smaller screens */}
        <div className="mb-8 mt-4 xl:hidden">
          <div className="h-10 bg-gray-200 dark:bg-zinc-700 rounded-md w-1/2 animate-pulse" />
        </div>

        {/* Tab panels for smaller screens */}
        <div className="px-0 md:px-8 xl:hidden">
          <SkeletonPanel />
        </div>

        {/* Side-by-side for larger screens */}
        <div className="hidden w-full h-full xl:grid xl:grid-cols-[1fr_auto_1fr] gap-0 px-0 md:px-8">
          <div className="pb-4 overflow-y-auto pr-8">
            <h2 className="h-8 bg-gray-200 dark:bg-zinc-700 rounded-md w-1/3 animate-pulse mb-4 mt-6" />
            <SkeletonPanel />
          </div>
          <div className="border-l border-secondary"></div>
          <div className="pb-4 overflow-y-auto pl-8">
            <h2 className="h-8 bg-gray-200 dark:bg-zinc-700 rounded-md w-1/3 animate-pulse mb-4 mt-6" />
            <SkeletonPanel />
          </div>
        </div>
      </div>
    </div>
  );
};

const SkeletonPanel: React.FC = () => {
  return (
    <>
      <div className="w-full mb-9 pb-4">
        <div className="w-full h-32 bg-gray-200 dark:bg-zinc-700 rounded-md animate-pulse" />
      </div>
      <div className="w-full">
        <div className="h-6 bg-gray-200 dark:bg-zinc-700 rounded-md w-1/4 animate-pulse mb-4" />
        <div className="h-20 bg-gray-200 dark:bg-zinc-700 rounded-md w-full animate-pulse" />
      </div>
    </>
  );
};

export default EnglishHelperSkeleton;
