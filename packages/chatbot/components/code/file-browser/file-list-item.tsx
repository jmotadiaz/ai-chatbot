"use client";

import { useMemo } from "react";
import type { FC, ComponentProps  } from "react";
import { ChevronRight, Folder } from "lucide-react";
import {
  Astro,
  Audio,
  CLang,
  CMake,
  Cplus,
  Csharp,
  Csv,
  Dart,
  Database,
  Docker,
  Document,
  EditorConfig,
  Elixir,
  Erlang,
  Eslint,
  Graphql,
  Go,
  H,
  Haskell,
  Ignore,
  Image,
  Java,
  Js,
  Kotlin,
  License,
  Lock,
  Lua,
  MDX,
  Markdown,
  Next,
  Nix,
  PHP,
  PNPM,
  PDF,
  PostCSS,
  Prettier,
  Prisma,
  Python,
  Reactts,
  Ruby,
  Rust,
  Sass,
  Scala,
  Shell,
  Stylus,
  Svelte,
  SVG,
  Swift,
  Terraform,
  TypeScript as Typescript,
  Video,
  Vue,
  XML,
  Yaml,
  Zig,
  Zip,
  GoMod,
} from "@react-symbols/icons";
import type { GitChangeStatus } from "./types";
import { cn } from "@/lib/utils/helpers";

type IconComponent = FC<ComponentProps<"svg">>;

function fileExt(filename: string): string | null {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0 || idx === filename.length - 1) return null;
  return filename.slice(idx + 1).toLowerCase();
}

const EXT_ICON_MAP: Record<string, IconComponent> = {
  js: Js,
  mjs: Js,
  cjs: Js,
  ts: Typescript,
  mts: Typescript,
  cts: Typescript,
  tsx: Reactts,
  jsx: Reactts,
  css: PostCSS,
  pcss: PostCSS,
  scss: Sass,
  sass: Sass,
  less: Stylus,
  styl: Stylus,
  html: H,
  htm: H,
  svg: SVG,
  md: Markdown,
  mdx: MDX,
  json: Document,
  yml: Yaml,
  yaml: Yaml,
  xml: XML,
  toml: Document,
  ini: Document,
  cfg: Document,
  conf: Document,
  env: Document,
  py: Python,
  rb: Ruby,
  rs: Rust,
  go: Go,
  java: Java,
  kt: Kotlin,
  scala: Scala,
  dart: Dart,
  php: PHP,
  c: CLang,
  h: CLang,
  cpp: Cplus,
  cxx: Cplus,
  hpp: Cplus,
  cs: Csharp,
  swift: Swift,
  lua: Lua,
  zig: Zig,
  vue: Vue,
  svelte: Svelte,
  astro: Astro,
  elixir: Elixir,
  ex: Elixir,
  exs: Elixir,
  erl: Erlang,
  hs: Haskell,
  graphql: Graphql,
  gql: Graphql,
  prisma: Prisma,
  sql: Database,
  sh: Shell,
  bash: Shell,
  zsh: Shell,
  fish: Shell,
  dockerfile: Docker,
  dockerignore: Ignore,
  gitignore: Ignore,
  eslintrc: Eslint,
  eslint: Eslint,
  prettierrc: Prettier,
  prettier: Prettier,
  editorconfig: EditorConfig,
  license: License,
  lock: Lock,
  tf: Terraform,
  nix: Nix,
  cmake: CMake,
  svx: Svelte,
  png: Image,
  jpg: Image,
  jpeg: Image,
  gif: Image,
  webp: Image,
  ico: Image,
  bmp: Image,
  tiff: Image,
  mp4: Video,
  webm: Video,
  mov: Video,
  avi: Video,
  mkv: Video,
  mp3: Audio,
  wav: Audio,
  ogg: Audio,
  flac: Audio,
  aac: Audio,
  m4a: Audio,
  pdf: PDF,
  zip: Zip,
  tar: Zip,
  gz: Zip,
  rar: Zip,
  "7z": Zip,
  bz2: Zip,
  xz: Zip,
  csv: Csv,
  next: Next,
  nginx: Document,
  nunjucks: Document,
  twig: Document,
  liquid: Document,
  tex: Document,
};

function iconForFile(title: string, isDir: boolean): IconComponent | null {
  if (isDir) return null;
  const lowered = title.toLowerCase();

  if (lowered === "dockerfile") return Docker;
  if (lowered === "docker-compose.yml" || lowered === "docker-compose.yaml") return Docker;
  if (lowered === "makefile") return Document;
  if (lowered === "license" || lowered.startsWith("license")) return License;
  if (lowered === ".gitignore") return Ignore;
  if (lowered === ".editorconfig") return EditorConfig;
  if (lowered === ".env" || lowered.startsWith(".env.")) return Document;
  if (lowered === ".prettierrc" || lowered === "prettier.config.js") return Prettier;
  if (lowered === ".eslintrc" || lowered === ".eslintrc.js" || lowered === ".eslintrc.json") return Eslint;
  if (lowered === "pnpm-lock.yaml") return PNPM;
  if (lowered === "go.mod") return GoMod;
  if (lowered === "go.sum") return GoMod;

  const ext = fileExt(title);
  if (!ext) return null;
  return EXT_ICON_MAP[ext] ?? null;
}

const BADGE_STYLES: Record<GitChangeStatus, { label: string; className: string }> = {
  modified: { label: "modified", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  added: { label: "added", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  untracked: { label: "new", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  renamed: { label: "renamed", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  deleted: { label: "deleted", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
};

export interface FileListItemProps {
  title: string;
  subtitle?: string;
  isDir?: boolean;
  badge?: GitChangeStatus;
  commentCount?: number;
  disabled?: boolean;
  onSelect: () => void;
}

export const FileListItem: React.FC<FileListItemProps> = ({
  title,
  subtitle,
  isDir = false,
  badge,
  commentCount = 0,
  disabled = false,
  onSelect,
}) => {
  const FileIcon = useMemo(() => iconForFile(title, isDir), [title, isDir]);

  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={cn(
          "flex w-full min-h-12 items-center gap-3 px-4 py-2 text-left cursor-pointer",
          "hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors",
          disabled && "opacity-50 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent",
        )}
      >
        {isDir ? (
          <Folder size={18} className="shrink-0 text-sky-500" />
        ) : FileIcon ? (
          <FileIcon width={18} height={18} className="shrink-0" />
        ) : (
          <Document width={18} height={18} className="shrink-0" />
        )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{title}</span>
        {subtitle && (
          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </span>
        )}
      </span>
      {commentCount > 0 && (
        <span className="shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400">
          {commentCount} 💬
        </span>
      )}
      {badge && (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            BADGE_STYLES[badge].className,
          )}
        >
          {BADGE_STYLES[badge].label}
        </span>
      )}
      {isDir && (
        <ChevronRight size={16} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
      )}
    </button>
  </li>
  );
};
