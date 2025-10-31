import React from "react";

const ImageEditorSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col w-full h-full pt-10 px-4">
      <div className="w-full h-full flex-1 max-w-[2048px] mx-auto">
        <div className="pt-6 space-y-4 lg:space-y-6">
          <div className="h-16 bg-gray-200 dark:bg-zinc-700 rounded-xl w-full lg:w-1/2 mx-auto animate-pulse" />

          <div className="snap-x snap-mandatory gap-6 lg:gap-20 flex w-full lg:w-1/2 mx-auto overflow-x-auto items-center flex-nowrap">
            <div className="relative snap-center flex-none w-full py-4">
              <div className="w-full h-[500px] bg-gray-200 dark:bg-zinc-700 rounded-lg animate-pulse" />
            </div>
          </div>
          <div className="h-16 bg-gray-200 dark:bg-zinc-700 rounded-xl w-full lg:w-1/2 mx-auto animate-pulse" />
        </div>
      </div>
    </div>
  );
};

export default ImageEditorSkeleton;
