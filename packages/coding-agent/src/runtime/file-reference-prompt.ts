/**
 * Appended to the coding agent's system prompt so file mentions in its
 * responses become clickable in the chat UI. The client intercepts links
 * with the `file:` scheme and routes them to the full-file view.
 */
export const FILE_REFERENCE_PROMPT = `## File references

When you mention a project file in a response, write it as a markdown link
using the "file:" scheme with the path relative to the project root, e.g.
[\`src/lib/utils.ts\`](file:src/lib/utils.ts). You may append ":<line>" to
the label for context, but the link target must be just the relative path.
Use this format only for files that actually exist in the project, and never
use absolute paths.`;
