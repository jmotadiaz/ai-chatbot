# File browser link → chat control in coding-agent text area

**Date:** 2026-08-19
**Status:** draft

## Goal

Move the file browser entry from the coding-agent page header into the chat
input's control row, rendered as a `ChatControl`-styled link immediately to the
right of the skills control. The header link is removed (move, not copy).

## Current state

- `FileBrowserEntryButton` (`packages/chatbot/components/code/file-browser/file-browser-entry-button.tsx`)
  is a `next/link` with `buttonVariants({ variant: "icon", size: "icon" })` and
  a `FolderTree` icon, rendered in `Header.Left` by `AgentCodeChatLayout`
  (`packages/chatbot/components/code/agent-code-chat-layout.tsx`).
- The text-area left control row in `AgentCodeChat`
  (`packages/chatbot/components/code/agent-code-chat.tsx`) renders, in order:
  `ReasoningControl` → `AttachmentsControl` → `SkillsControl`. All are
  pill-shaped `ChatControl` buttons (`components/chat/control.tsx`:
  `rounded-full p-2 bg-black text-white`).

## Design (option A: extend `ChatControl` with an optional `href`)

1. **`components/chat/control.tsx`** — add an optional `href?: string` prop to
   `ChatControlProps`. When `href` is set, render `next/link`'s `Link` instead
   of the `<button>`, using the same non-loading pill classes (loading,
   `onLoadingClick` and `type` are not applicable to a link). Behavior of the
   button path is unchanged, so the regular chat UI is unaffected.

2. **`components/code/agent-code-chat.tsx`** — in the left control row, add
   right after `<SkillsControl .../>`:

   ```tsx
   <ChatControl
     Icon={FolderTree}
     href={`/agent/code/${project}/${sessionId}/files`}
     aria-label="Browse project files"
     title="Browse project files"
   />
   ```

   Import `FolderTree` from `lucide-react`.

3. **`components/code/agent-code-chat-layout.tsx`** — remove the
   `<FileBrowserEntryButton ... />` render and its import.

4. **Delete `components/code/file-browser/file-browser-entry-button.tsx`**
   (single consumer, no tests reference it).

## Notes

- Styling is intentionally identical to the sibling pill controls
  (`rounded-full p-2 bg-black text-white`, disabled/dark variants included via
  the shared class string).
- The file browser route `/agent/code/[project]/[sessionId]/files` and the
  `FileBrowserProvider` are untouched.
- No changes to the coding-agent worker package.

## Testing

- Unit/component: add a component test under `packages/chatbot/tests/component`
  asserting `ChatControl` renders a link with the given `href` when the prop
  is set, and a plain button otherwise (no existing `ChatControl` tests to
  mirror).
- Verified: no existing test asserts the header button
  (`aria-label="Browse project files"`), so nothing to update.
