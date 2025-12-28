"use client";

import { useCallback, useState } from "react";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import { getChatConfigurationByModelId } from "@/lib/features/foundation-model/helpers";
import type { FilePart } from "@/lib/features/attachment/types";
import { handleFileUpload } from "@/lib/features/attachment/utils";

export interface ChatFilesState {
  files: FilePart[];
  setFiles: React.Dispatch<React.SetStateAction<FilePart[]>>;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const useChatFilesState = ({
  selectedModel,
  initialFiles = [],
}: {
  selectedModel: chatModelId;
  initialFiles?: FilePart[];
}): ChatFilesState => {
  const [files, setFiles] = useState<FilePart[]>(initialFiles);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFileUpload(
        setFiles,
        e.target.files,
        getChatConfigurationByModelId(selectedModel).supportedFiles
      );
    },
    [selectedModel]
  );

  return { files, setFiles, handleFileChange };
};


