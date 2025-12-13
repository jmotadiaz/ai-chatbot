import { X } from "lucide-react";
import { useChatContext } from "@/app/(chat)/chat-provider";
import { FileThumbnail } from "@/components/attachment-thumbnail";
import { cn } from "@/lib/utils/helpers";
import type { FilePart } from "@/lib/features/attachment/types";
import { deleteFile } from "@/lib/features/attachment/actions";
import { CircleProgress } from "@/components/icons";

export interface PreviewFilesProps {
  className?: string;
}

export const PreviewFiles: React.FC<PreviewFilesProps> = ({ className }) => {
  const { files, setFiles } = useChatContext();

  const removeFile = (fileToDelete: FilePart) => {
    deleteFile(fileToDelete.url);
    setFiles(files.filter((file) => file.filename !== fileToDelete.filename));
  };

  if (files.length === 0) {
    return null;
  }
  return (
    <div
      data-testid="attachments-preview"
      className={cn("flex space-x-3 items-center", className)}
    >
      {files.map((file, idx) => (
        <div
          className="relative cursor-pointer"
          key={idx}
          onClick={() => !file.loading && removeFile(file)}
        >
          {!file.loading && (
            <div
              className={cn(
                "bg-secondary absolute p-1 rounded-full opacity-80",
                file.mediaType.startsWith("image/")
                  ? "top-1/2 left-1/2 transform -translate-y-1/2 -translate-x-1/2"
                  : "top-1/2 right-2 transform -translate-y-1/2"
              )}
            >
              <X size={15} />
            </div>
          )}
          {file.loading && (
            <div
              className={cn(
                "bg-secondary absolute top-1/2 left-1/2 transform -translate-y-1/2 -translate-x-1/2 p-1 rounded-full opacity-80 text-xs"
              )}
            >
              <CircleProgress size={15} progress={file.loading.percentage} />
            </div>
          )}
          <FileThumbnail file={file} />
        </div>
      ))}
    </div>
  );
};
