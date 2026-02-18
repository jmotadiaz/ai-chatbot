import { clsx, type ClassValue } from "clsx";
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

export const normalize = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[^a-z0-9 ]/gi, " ")
    .toLowerCase()
    .trim();
export const toWords = (str: string): string[] => {
  return [...new Set(str.split(/\s+/))];
};

export const isEmpty = <T>(
  value: T | null | undefined,
): value is null | undefined =>
  value === null ||
  value === undefined ||
  (typeof value === "object" && Object.keys(value).length === 0);

export const handleCopy =
  (value: string | null | undefined) => async (): Promise<boolean> => {
    if (!value) {
      return false;
    }
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  };

export const isDefined = <T>(value: T | null | undefined): value is T =>
  Boolean(value);

export const hasUrls = (text: string): boolean => {
  const urlRegex = /https?:\/\/[^\s/$.?#].[^\s]*/g;
  return urlRegex.test(text);
};

export const removeExtension = (filename: string = ""): string => {
  return filename.replace(/\.[^/.]+$/, "");
};

export const formatFilename = (filename: string = ""): string => {
  const filenameWithoutExtension = removeExtension(filename);

  return filenameWithoutExtension.length > 20
    ? `${filenameWithoutExtension.slice(0, 20)}...`
    : filenameWithoutExtension;
};

export const extractMediaType = (mediaType: string): string => {
  const parts = mediaType.split("/");
  return parts.at(-1) || mediaType;
};
