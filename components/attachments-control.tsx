"use client";

import { Paperclip } from "lucide-react";
import { Dispatch, SetStateAction, useRef } from "react";
import { Button } from "@/components/ui/button";

interface AttachmentsControlProps {
  attachments: File[];
  setAttachments: Dispatch<SetStateAction<File[]>>;
}

export const AttachmentsControl = ({
  setAttachments,
}: AttachmentsControlProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments((prev) => {
        const newAttachments = [...prev];
        Array.from(e.target.files as FileList).forEach((file) => {
          newAttachments.push(file);
        });
        return newAttachments;
      });
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={handleClick}
        aria-label="Add attachment"
      >
        <Paperclip className="h-5 w-5" />
        <span className="sr-only">Add attachment</span>
      </Button>
    </>
  );
};
