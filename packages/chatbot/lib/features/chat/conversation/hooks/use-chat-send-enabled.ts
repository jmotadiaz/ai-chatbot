"use client";

import { useMemo } from "react";
import type { FilePart } from "@/lib/features/attachment/types";

export const useChatSendEnabled = ({
  input,
  files,
}: {
  input: string;
  files: FilePart[];
}): boolean => {
  return useMemo(() => {
    return !!input.trim() || (files.length > 0 && files.every((f) => !f.loading));
  }, [files, input]);
};


