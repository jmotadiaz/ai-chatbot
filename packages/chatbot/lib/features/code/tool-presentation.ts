const TOOL_DISPLAY_NAMES: Record<string, string> = {
  bash: "Shell",
  shell: "Shell",
  read: "Read",
  write: "Write",
  edit: "Edit",
  grep: "Grep",
  find: "Find",
  ls: "Ls",
  subagent: "Subagent",
  publish_artifact: "Artifact",
};

/**
 * Human name of a tool call, shared by the per-call row and the ReAct Cycle
 * header so both name the same tool the same way. Pure: the icon mapping lives
 * in the component layer.
 */
export function toolDisplayName(name: string): string {
  return TOOL_DISPLAY_NAMES[name.toLowerCase()] ?? name;
}
