import { clsx, type ClassValue } from "clsx";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function scapeXML(str: string): string {
  if (!str) return "";

  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .trim();
}

export const handleCopy = (value: string | null | undefined) => async () => {
  if (!value) {
    toast.error("Nothing to copy");
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Text copied to clipboard");
  } catch {
    toast.error("Failed to copy text");
  }
};

export const isDefined = <T>(value: T | null | undefined): value is T =>
  Boolean(value);

export const hasUrls = (text: string): boolean => {
  const urlRegex = /https?:\/\/[^\s/$.?#].[^\s]*/g;
  return urlRegex.test(text);
};
