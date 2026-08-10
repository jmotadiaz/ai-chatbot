import React from "react";
import { SidebarContainer } from "@/components/layout/sidebar/container";
import { AgentCodeChatSkeleton } from "@/components/code/coding-agent-skeletons";

/**
 * Without this the router keeps the previous page on screen until the session's
 * server render finishes, which is what made navigating here feel heavy: the
 * page waits on the worker for the snapshot, the model, the skills and the
 * prompts. The Suspense boundary Next builds around `loading.tsx` lets the
 * navigation commit immediately and streams the real page in behind it.
 *
 * The boundary also covers the nested `files` and `subagent` segments, which
 * is why those have a `loading.tsx` of their own — otherwise navigating to
 * them would flash this chat frame before their own shell.
 */
const Loading: React.FC = () => (
  <>
    <SidebarContainer />
    <AgentCodeChatSkeleton />
  </>
);

export default Loading;
