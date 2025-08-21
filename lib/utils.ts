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

export const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

export const toWords = (str: string): string[] => {
  return [
    ...new Set(
      str
        .replace(/[^a-z0-9 ]/gi, " ")
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length > 0)
    ),
  ];
};

export const isEmpty = <T>(
  value: T | null | undefined
): value is null | undefined =>
  value === null ||
  value === undefined ||
  (typeof value === "object" && Object.keys(value).length === 0);

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
