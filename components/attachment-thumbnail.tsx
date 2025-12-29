import React from "react";
import { FileIcon } from "lucide-react";
import type { FilePart } from "@/lib/features/attachment/types";

export const FileThumbnail = ({ file }: { file: File | FilePart }) => {
  const isFile = file instanceof File;
  const isImage = isFile ? file.type.startsWith("image/") : file.mediaType.startsWith("image/");
  const url = isFile ? URL.createObjectURL(file) : file.url;
  const name = isFile ? file.name : file.filename;

  if (isImage) {
    return (
      <div className="relative w-16 h-16 rounded-md overflow-hidden border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name || "image"}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center w-16 h-16 rounded-md border border-border bg-muted">
      <FileIcon className="h-8 w-8 text-muted-foreground" />
    </div>
  );
};

export const AttachmentThumbnail = FileThumbnail;
