"use client";

import { useCallback } from "react";
import type { FilePart } from "@/lib/features/attachment/types";
import { handleFileUpload } from "@/lib/features/attachment/utils";
import { ModelConfiguration } from "@/lib/features/foundation-model/types";

export const useHandleFileChange = ({
  setFiles,
  supportedFiles,
}: {
  setFiles: React.Dispatch<React.SetStateAction<FilePart[]>>;
  supportedFiles: Required<ModelConfiguration>["supportedFiles"];
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


