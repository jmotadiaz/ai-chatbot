"use client";

import { X } from "lucide-react";
import type { ClassValue } from "clsx";
import { Dispatch, SetStateAction } from "react";
import { AttachmentThumbnail } from "./attachment-thumbnail";
import { cn } from "@/lib/utils/helpers";
import { Button } from "@/components/ui/button";

interface PreviewFilesProps {
  className?: ClassValue;
  attachments: File[];
  setAttachments: Dispatch<SetStateAction<File[]>>;
}

export const PreviewFiles = ({
  className,
  attachments,
  setAttachments,
}: PreviewFilesProps) => {
  if (attachments.length === 0) return null;

  return (
    <div className={cn("flex flex-row gap-2 overflow-x-auto", className)}>
      {attachments.map((file, index) => (
        <div key={index} className="relative group">
          <AttachmentThumbnail file={file} />
          <Button
            variant="ghost"
            size="icon"
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => {
              setAttachments((prev) => prev.filter((_, i) => i !== index));
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
};
