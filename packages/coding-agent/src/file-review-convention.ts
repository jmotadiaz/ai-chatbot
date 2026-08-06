/**
 * Appended to the coding agent's system prompt so that design specs, plans,
 * and any document undergoing iterative review are materialised as files
 * before discussion begins. The chatbot harness renders uncommitted Markdown
 * files in the file browser with per-block commenting; comments are sent to
 * the agent as a "Code review comments:" block (file → line → snippet →
 * text), turning the file itself into the review surface.
 */
export const FILE_REVIEW_CONVENTION = `## Harness convention: write before you discuss

This agent runs inside a chatbot harness whose file browser lets the user
attach line comments to uncommitted Markdown files and send them as a "Code
review comments:" block (file, line, snippet, comment).

When the agent and user are about to discuss a design spec, a plan, or any
document that will be revised through iteration:

- The agent writes the current draft as an uncommitted file before asking
  for feedback.
- The discussion then happens through the file browser: the user adds
  comments on specific blocks, the agent edits the file in response, and
  the chat is used only for the broader conversation (clarifying questions,
  summarising changes, signalling approval).
- The file stays uncommitted during the review loop and is committed only
  after the user approves it.

The point: don't have a back-and-forth about a spec or plan that only
exists in the chat log. Put it in a file first.`;
