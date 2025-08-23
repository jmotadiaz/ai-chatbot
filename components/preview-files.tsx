import { X } from "lucide-react";
import { useChatContext } from "@/app/providers";
import { FileThumbnail } from "@/components/file-thumbnail";
import { cn } from "@/lib/utils";

export interface PreviewFilesProps {
  className?: string;
}

export const PreviewFiles: React.FC<PreviewFilesProps> = ({ className }) => {
  const { files, setFiles } = useChatContext();

  const removeFile = (url: string) => {
    setFiles(files.filter((file) => file.url !== url));
  };

  if (files.length === 0) {
    return null;
  }
  return (
    <div className={cn("flex space-x-3 items-center", className)}>
      {files.map(({ url, mediaType }, idx) => (
        <div
          className="relative cursor-pointer"
          key={idx}
          onClick={() => removeFile(url)}
        >
          <X className="h-2 w-2 absolute top-0.5 right-0.5" />
          <FileThumbnail url={url} mediaType={mediaType} />
        </div>
      ))}
    </div>
  );
};
