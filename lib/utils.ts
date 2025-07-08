import { clsx, type ClassValue } from "clsx";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
