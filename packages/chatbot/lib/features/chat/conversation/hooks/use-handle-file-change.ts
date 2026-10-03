"use client";

import { useCallback } from "react";
import type { FilePart } from "@/lib/features/attachment/types";
import { handleFileUpload } from "@/lib/features/attachment/utils";
import type { ChatModelConfiguration } from "@/lib/features/foundation-model/config";

export const useHandleFileChange = ({
  setFiles,
  supportedFiles,
}: {
  setFiles: React.Dispatch<React.SetStateAction<FilePart[]>>;
  supportedFiles: ChatModelConfiguration["supportedFiles"];
}): {
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
} => {

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFileUpload(setFiles, e.target.files, supportedFiles);
    },
    [supportedFiles, setFiles]
  );

  return { handleFileChange };
};


