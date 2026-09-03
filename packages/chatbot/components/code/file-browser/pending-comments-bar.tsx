"use client";

import { CommentChip } from "./comment-chip";
import { useFileBrowser } from "./file-browser-provider";

export interface PendingCommentsBarProps {
  disabled?: boolean;
}

export const PendingCommentsBar: React.FC<PendingCommentsBarProps> = ({
  disabled = false,
}) => {
  const { state, actions } = useFileBrowser();
  if (state.pendingComments.length === 0) return null;
  return (
    <div
      data-testid="pending-comments-bar"
      className="flex max-w-full items-center space-x-2 overflow-x-auto scrollbar-none pb-2"
    >
      {state.pendingComments.map((comment) => (
        <CommentChip
          key={comment.id}
          comment={comment}
          onRemove={() => actions.removeComment(comment.id)}
          disabled={disabled}
        />
      ))}
    </div>
  );
};
