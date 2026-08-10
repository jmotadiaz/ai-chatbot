import React from "react";
import { SidebarContainer } from "@/components/layout/sidebar/container";
import { SubagentSessionSkeleton } from "@/components/code/coding-agent-skeletons";

/**
 * Overrides the session page's fallback: this view is read-only, so showing a
 * composer that then disappears would be a worse frame than none.
 */
const Loading: React.FC = () => (
  <>
    <SidebarContainer />
    <SubagentSessionSkeleton />
  </>
);

export default Loading;
