import { X } from "lucide-react";
import { useChatContext } from "@/app/providers";
import { FileThumbnail } from "@/components/attachment-thumbnail";
import { cn } from "@/lib/utils";

export interface PreviewFilesProps {
  className?: string;
}

export const PreviewFiles: React.FC<PreviewFilesProps> = ({ className }) => {
  const { files, setFiles } = useChatContext();

  const removeFile = (filename: string = "") => {
    setFiles(files.filter((file) => file.filename !== filename));
  };

  if (files.length === 0) {
    return null;
  }
  return (
    <div className={cn("flex space-x-3 items-center", className)}>
      {files.map((file, idx) => (
        <div
          className="relative cursor-pointer"
          key={idx}
          onClick={() => removeFile(file.filename)}
        >
          <div
            className={cn(
              "bg-secondary absolute top-2 right-2 p-1 rounded-full opacity-80"
            )}
          >
            <X className="h-3 w-3" />
          </div>
          <FileThumbnail file={file} />
        </div>
      ))}
    </div>
  );
};
