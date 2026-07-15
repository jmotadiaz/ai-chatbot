"use client";

export interface FileListProps {
  children: React.ReactNode;
}

export const FileList: React.FC<FileListProps> = ({ children }) => (
  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">{children}</ul>
);
