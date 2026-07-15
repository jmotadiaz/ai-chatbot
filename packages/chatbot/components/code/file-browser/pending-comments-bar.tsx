"use client";

import { CommentChip } from "./comment-chip";
import { useFileBrowser } from "./file-browser-provider";

export const PendingCommentsBar: React.FC = () => {
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
        />
      ))}
    </div>
  );
};
