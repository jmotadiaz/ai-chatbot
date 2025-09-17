"use server";
import { del } from "@vercel/blob";

export const deleteFile = async (fileUrl: string): Promise<void> => {
  const url = new URL(fileUrl);
  await del(url.pathname);
};
