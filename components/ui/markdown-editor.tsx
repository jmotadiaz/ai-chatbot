"use client";
import MDEditor, { commands } from "@uiw/react-md-editor";
import { cn } from "@/lib/utils";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  isLoading?: boolean;
  extraCommands?: commands.ICommand[];
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  extraCommands,
  isLoading = false,
}) => {
  return (
    <MDEditor
      preview="edit"
      className="relative"
      value={value}
      onChange={(value) => onChange(value ?? "")}
      components={{
        textarea: isLoading ? LoadingComponent : undefined,
        preview: isLoading ? LoadingComponent : undefined,
      }}
      extraCommands={[
        ...(extraCommands || []),
        commands.divider,
        commands.codeEdit,
        commands.codeLive,
        commands.codePreview,
        commands.divider,
        commands.fullscreen,
      ]}
    />
  );
};

const LoadingComponent = () => (
  <div className={cn("absolute top-0 bottom-0 pt-4 px-4 left-0 w-full h-full")}>
    <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-2xl py-2 animate-pulse mb-3" />
    <div className="w-4/5 bg-gray-200 dark:bg-zinc-700 rounded-2xl py-2 animate-pulse mb-3" />
    <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-2xl py-2 animate-pulse mb-3" />
    <div className="w-2/5 bg-gray-200 dark:bg-zinc-700 rounded-2xl mt-2 py-2 animate-pulse" />
  </div>
);
