import React from "react";
import { SidebarContainer } from "@/components/layout/sidebar/container";
import { FileBrowserSkeleton } from "@/components/code/coding-agent-skeletons";

/** Overrides the session page's fallback so this route never flashes a chat. */
const Loading: React.FC = () => (
  <>
    <SidebarContainer />
    <FileBrowserSkeleton />
  </>
);

export default Loading;
