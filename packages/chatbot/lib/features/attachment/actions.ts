"use server";

export const deleteFile = async (_fileUrl: string): Promise<void> => {
  // Local files (data-URLs) need no remote deletion in blob storage.
};
