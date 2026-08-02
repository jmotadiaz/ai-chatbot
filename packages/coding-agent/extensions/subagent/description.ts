/**
 * Tool description for the `subagent` tool. Registration is synchronous, so
 * the available-models list cannot be fetched at load time — when no list is
 * provided the description points the model at the error message, which
 * carries the full list on invalid input (spec §4.1/§4.2).
 */
export function buildSubagentToolDescription(models: string[]): string {
  return [
    "Delegate a self-contained task to a subagent running in an isolated session.",
    "The subagent inherits this session's tools (except subagent itself), skills and working directory.",
    "Use multiple subagent calls in one response to run tasks in parallel.",
    "For parallel implementation work, create one git worktree per subagent inside the project (e.g. .worktrees/<name>) and pass it as cwd.",
    models.length > 0
      ? `Available models for the optional model param: ${models.join(", ")}.`
      : "The optional model param takes a provider/model-id value; an invalid value returns the full list of available models.",
    "The agent param is reserved for a future agent-definition format and must not be used.",
  ].join(" ");
}
