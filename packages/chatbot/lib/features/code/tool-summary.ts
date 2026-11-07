import { safeStringify } from "./json";

const MAX_SUMMARY = 80;

export function truncate(s: string, max = MAX_SUMMARY): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export interface CompactPathOptions {
  project?: string;
  offset?: number | string | null;
  limit?: number | string | null;
}

function formatRange(
  offset?: number | string | null,
  limit?: number | string | null,
): string {
  if (offset == null) return "";
  const off = Number(offset);
  if (!Number.isFinite(off) || off <= 0) return "";
  if (limit != null) {
    const lim = Number(limit);
    if (Number.isFinite(lim) && lim > 0) {
      return `:${off}–${off + lim}`;
    }
  }
  return `:${off}`;
}

/**
 * Normalizes and shortens file paths for concise tool summary display.
 *
 * Rules:
 * 1. Strips host/worktree/repo prefixes if `project` is supplied.
 * 2. Monorepo packages: `packages/<pkg>/...` -> `<pkg>/...`.
 * 3. Skills: `.agents/skills/<skill>/...` -> `skills/<skill>/...`.
 * 4. Elides intermediate segments with `…` when segment count > 3:
 *    - If penultimate segment is dynamic (`[...]` or `(...)`), keeps 3 tail segments.
 *    - Otherwise keeps 2 tail segments.
 * 5. Appends line range suffix `:start–end` when `offset`/`limit` are specified.
 */
export function compactPath(
  rawPath: string,
  options?: CompactPathOptions,
): string {
  if (!rawPath || typeof rawPath !== "string") return "";
  let p = rawPath.trim().replace(/\\/g, "/");

  const rawIsAbsolute = p.startsWith("/");
  let isProjectRelative = !rawIsAbsolute;

  // 1. Strip project workspace / worktree prefix when project is known
  if (options?.project) {
    const escaped = options.project.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const projectRegex = new RegExp(
      `^(?:.*?\\/)?${escaped}\\/(?:\\.worktrees\\/[^\\/]+\\/)?`,
    );
    if (projectRegex.test(p)) {
      p = p.replace(projectRegex, "");
      isProjectRelative = true;
    }
  } else {
    const worktreeRegex = /^(?:.*?\/)?\.worktrees\/[^/]+\//;
    if (worktreeRegex.test(p)) {
      p = p.replace(worktreeRegex, "");
      isProjectRelative = true;
    }
  }

  // 2. Monorepo package / skills / scratch normalization
  if (isProjectRelative) {
    if (/^packages\/([^/]+)\/(.*)$/.test(p)) {
      p = p.replace(/^packages\//, "");
    } else if (/^(?:\.agents\/)?skills\/([^/]+)\/(.*)$/.test(p)) {
      p = p.replace(/^(?:\.agents\/)?skills\//, "skills/");
    } else if (/^\.scratch\/(.*)$/.test(p)) {
      p = p.replace(/^\.scratch\//, ".scratch/");
    }
  } else if (!options?.project) {
    if (/^.*?(?:^|\/)packages\/([^/]+)\/(.*)$/.test(p)) {
      p = p.replace(/^.*?(?:^|\/)packages\//, "");
    } else if (/^.*?(?:^|\/)(?:\.agents\/)?skills\/([^/]+)\/(.*)$/.test(p)) {
      p = p.replace(/^.*?(?:^|\/)(?:\.agents\/)?skills\//, "skills/");
    } else if (/^.*?(?:^|\/)\.scratch\/(.*)$/.test(p)) {
      p = p.replace(/^.*?(?:^|\/)\.scratch\//, ".scratch/");
    }
  }

  p = p.replace(/^\.\//, "");
  const isAbsolute = p.startsWith("/");
  const segments = p.split("/").filter(Boolean);

  let formatted = p;
  // If > 3 segments (4 or more), elide the middle
  if (segments.length > 3) {
    const first = segments[0]!;
    const penultimate = segments[segments.length - 2] ?? "";
    const isDynamicOrGroup = /^[([].*[\])]$/.test(penultimate);
    const tailCount = isDynamicOrGroup && segments.length >= 5 ? 3 : 2;
    const tail = segments.slice(-tailCount);
    formatted = `${isAbsolute ? "/" : ""}${first}/…/${tail.join("/")}`;
  }

  formatted += formatRange(options?.offset, options?.limit);

  return formatted;
}

/**
 * Cleans command lines to surface the meaningful portion in the compact summary.
 * Strips boilerplate `cd <dir> &&`, extracts the interpreter line for heredocs,
 * takes the first non-comment line for scripts, and collapses whitespace.
 */
export function cleanBashCommand(cmd: string): string {
  let s = cmd.trim();
  s = s.replace(/^cd\s+(?:[^\s&;]+|"[^"]*"|'[^']*')\s*&&\s*/, "");
  const lines = s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length > 0) {
    s = lines[0]!;
  }
  return s.replace(/\s+/g, " ").trim();
}

function extractPrioritizedScalar(
  obj: Record<string, unknown>,
): string | undefined {
  const PRIORITY_KEYS = [
    "description",
    "title",
    "label",
    "name",
    "path",
    "filePath",
    "url",
    "query",
    "pattern",
    "command",
    "cmd",
    "id",
  ];
  for (const key of PRIORITY_KEYS) {
    const val = obj[key];
    if (typeof val === "string" && val.trim().length > 0) return val.trim();
    if (typeof val === "number") return String(val);
  }
  return undefined;
}

function extractStreamingArg(
  raw?: string,
  ...keys: string[]
): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  for (const key of keys) {
    const match = raw.match(
      new RegExp(`"${key}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"?`),
    );
    if (match?.[1] !== undefined) {
      try {
        return JSON.parse(`"${match[1]}"`);
      } catch {
        return match[1];
      }
    }
  }
  return undefined;
}

export interface ToolSummaryOptions extends CompactPathOptions {
  rawArgs?: string;
  result?: string;
  status?: string;
}

export interface ToolDescription {
  summary: string;
  title?: string;
}

export function describeToolCall(
  name: string,
  args: unknown,
  options?: ToolSummaryOptions,
): ToolDescription {
  const a = (args && typeof args === "object" ? args : {}) as Record<
    string,
    unknown
  >;
  const toolName = name.toLowerCase();

  switch (toolName) {
    case "bash":
    case "shell": {
      const rawCmd =
        a?.command ??
        a?.cmd ??
        extractStreamingArg(options?.rawArgs, "command", "cmd");
      if (typeof rawCmd === "string") {
        const fullCmd = rawCmd.trim();
        const cleaned = cleanBashCommand(fullCmd);
        const summary = truncate(cleaned);
        const title = fullCmd && fullCmd !== summary ? fullCmd : undefined;
        return { summary, title };
      }
      const summary = truncate(String(rawCmd ?? ""));
      return { summary };
    }
    case "read": {
      const p = String(
        a?.path ??
          a?.filePath ??
          extractStreamingArg(options?.rawArgs, "path", "filePath") ??
          "",
      );
      if (!p) return { summary: "" };
      const offset = (a?.offset ??
        extractStreamingArg(options?.rawArgs, "offset")) as
        | number
        | string
        | undefined;
      const limit = (a?.limit ??
        extractStreamingArg(options?.rawArgs, "limit")) as
        | number
        | string
        | undefined;
      const effectiveOffset = offset ?? options?.offset;
      const effectiveLimit = limit ?? options?.limit;
      const compacted = compactPath(p, {
        project: options?.project,
        offset: effectiveOffset,
        limit: effectiveLimit,
      });
      const summary = truncate(compacted);
      const rawWithRange = `${p}${formatRange(effectiveOffset, effectiveLimit)}`;
      const title = rawWithRange !== summary ? rawWithRange : undefined;
      return { summary, title };
    }
    case "write":
    case "edit": {
      const p = String(
        a?.path ?? extractStreamingArg(options?.rawArgs, "path") ?? "",
      );
      if (!p) return { summary: "" };
      const compacted = compactPath(p, { project: options?.project });
      const summary = truncate(compacted);
      const title = p !== summary ? p : undefined;
      return { summary, title };
    }
    case "grep": {
      const p = a?.path
        ? String(a.path)
        : extractStreamingArg(options?.rawArgs, "path");
      const pattern =
        (a?.pattern as string | undefined) ??
        extractStreamingArg(options?.rawArgs, "pattern");
      const pathStr = p ? compactPath(p, { project: options?.project }) : "";
      const summary = truncate(
        [pattern, pathStr ? `in ${pathStr}` : ""].filter(Boolean).join(" "),
      );
      const fullTitle = [pattern, p ? `in ${p}` : ""].filter(Boolean).join(" ");
      const title = fullTitle && fullTitle !== summary ? fullTitle : undefined;
      return { summary, title };
    }
    case "find": {
      const pattern =
        (a?.pattern != null ? String(a.pattern).trim() : undefined) ??
        extractStreamingArg(options?.rawArgs, "pattern");
      if (pattern && pattern.length > 0) {
        return { summary: truncate(pattern) };
      }
      const p = a?.path
        ? String(a.path)
        : extractStreamingArg(options?.rawArgs, "path");
      const pathStr = p ? compactPath(p, { project: options?.project }) : "";
      const summary = truncate(pathStr);
      const title = p && p !== summary ? p : undefined;
      return { summary, title };
    }
    case "ls": {
      const p = a?.path
        ? String(a.path)
        : extractStreamingArg(options?.rawArgs, "path");
      const pathStr = p ? compactPath(p, { project: options?.project }) : "";
      const summary = truncate(pathStr);
      const title = p && p !== summary ? p : undefined;
      return { summary, title };
    }
    case "publish_artifact": {
      const artifactName = a?.name
        ? String(a.name)
        : extractStreamingArg(options?.rawArgs, "name") ??
          (a?.path
            ? compactPath(String(a.path), { project: options?.project })
            : extractStreamingArg(options?.rawArgs, "path")
              ? compactPath(extractStreamingArg(options?.rawArgs, "path")!, {
                  project: options?.project,
                })
              : "");
      const summary = truncate(artifactName);
      const rawPath = a?.path
        ? String(a.path)
        : extractStreamingArg(options?.rawArgs, "path");
      const title = a?.name && rawPath ? `${a.name} (${rawPath})` : undefined;
      return { summary, title };
    }
    case "subagent": {
      const description =
        (typeof a?.description === "string" ? a.description.trim() : "") ||
        extractStreamingArg(options?.rawArgs, "description") ||
        "";
      if (description) {
        return {
          summary: truncate(description),
          title: description.length > MAX_SUMMARY ? description : undefined,
        };
      }
      const task =
        (typeof a?.task === "string" ? a.task : "") ||
        extractStreamingArg(options?.rawArgs, "task") ||
        "";
      const firstLine = task.split("\n", 1)[0] ?? "";
      return {
        summary: truncate(firstLine),
        title: task && task !== firstLine ? task : undefined,
      };
    }
    default: {
      const scalar = extractPrioritizedScalar(a);
      if (scalar) {
        const summary = truncate(scalar);
        const title = scalar !== summary ? scalar : undefined;
        return { summary, title };
      }
      const stringified = safeStringify(a);
      const summary = truncate(stringified);
      const title = stringified !== summary ? stringified : undefined;
      return { summary, title };
    }
  }
}

export function summarizeToolCall(
  name: string,
  args: unknown,
  options?: ToolSummaryOptions,
): string {
  return describeToolCall(name, args, options).summary;
}
