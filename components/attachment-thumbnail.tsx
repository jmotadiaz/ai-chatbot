import Image from "next/image";
import type { FilePart } from "@/lib/features/attachment/types";
import { extractMediaType, formatFilename } from "@/lib/utils";

interface FileThumbnailProps {
  file: FilePart;
}

export const FileThumbnail: React.FC<FileThumbnailProps> = ({ file }) => {
  if (file.mediaType.startsWith("image/")) {
    return (
      <div className="h-14 w-14 overflow-hidden rounded-xl">
        <Image
          src={file.url}
          width={56}
          height={56}
          className="h-full w-full object-cover object-center"
          alt={file.filename || "attachment"}
        />
      </div>
    );
  } else {
    return (
      <div className="h-12 flex rounded-xl bg-zinc-500  dark:bg-zinc-700 text-gray-100 flex-col justify-center pl-4 pr-12 py-2 text-sm font-semibold">
        <span className="whitespace-nowrap mb-0.5">
          {formatFilename(file.filename)}
        </span>
        <span className="whitespace-nowrap uppercase text-xs opacity-60">
          {extractMediaType(file.mediaType)}
        </span>
      </div>
    );
  }
};
