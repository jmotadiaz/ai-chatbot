const MAX_SUMMARY = 80;

function truncate(s: string, max = MAX_SUMMARY): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function summarizeToolCall(name: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  switch (name.toLowerCase()) {
    case "bash":
    case "shell":
      return truncate(String(a?.command ?? a?.cmd ?? ""));
    case "read":
      return String(a?.path ?? a?.filePath ?? "");
    case "write":
      return String(a?.path ?? "");
    case "edit":
      return String(a?.path ?? "");
    case "grep":
      return [a?.pattern, a?.path ? `in ${String(a.path)}` : ""]
        .filter(Boolean)
        .join(" ");
    case "find":
      return String(a?.pattern ?? a?.path ?? "");
    case "ls":
      return String(a?.path ?? "");
    default:
      return truncate(safeStringify(a));
  }
}
