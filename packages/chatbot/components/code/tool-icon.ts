"use client";

import {
  Bot,
  FilePlus,
  FileText,
  FolderOpen,
  Layout,
  Pencil,
  Search,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const TOOL_ICONS: Record<string, LucideIcon> = {
  bash: Terminal,
  shell: Terminal,
  read: FileText,
  write: FilePlus,
  edit: Pencil,
  grep: Search,
  find: FolderOpen,
  ls: FolderOpen,
  subagent: Bot,
  publish_artifact: Layout,
};

/** Icon of a tool call; the per-call row and the ReAct Cycle header share it. */
export function toolIcon(name: string): LucideIcon {
  return TOOL_ICONS[name.toLowerCase()] ?? Wrench;
}
