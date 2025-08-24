import Image from "next/image";
import { FilePart } from "@/lib/ai/utils";

interface FileThumbnailProps {
  file: FilePart;
}

const removeExtension = (filename: string = "") => {
  return filename.replace(/\.[^/.]+$/, "");
};

const extractMediaType = (mediaType: string) => {
  const parts = mediaType.split("/");
  return parts.at(-1) || mediaType;
};

export const FileThumbnail: React.FC<FileThumbnailProps> = ({ file }) => {
  if (file.mediaType.startsWith("image/")) {
    return (
      <div className="h-15 w-15 overflow-hidden rounded-2xl">
        <Image
          src={file.url}
          width={20}
          height={20}
          className="h-full w-full object-cover object-center"
          alt="attachment"
        />
      </div>
    );
  } else {
    return (
      <div className="h-15 flex rounded-2xl bg-zinc-700 text-gray-100 flex-col justify-around pl-4 pr-12 py-2 text-sm font-medium">
        <span className="whitespace-nowrap">
          {removeExtension(file.filename)}
        </span>
        <span className="whitespace-nowrap">
          {extractMediaType(file.mediaType)}
        </span>
      </div>
    );
  }
};
