import { ChatHomeComponent } from "@/app/(chat)/(home)/component";
import { SidebarContainer } from "@/components/layout/sidebar/container";
import { ChatLifecycleShell } from "@/components/chat/lifecycle-shell";

const Loading: React.FC = () => {
  return (
    <ChatLifecycleShell>
      <SidebarContainer />
      <ChatHomeComponent />
    </ChatLifecycleShell>
  );
};

export default Loading;
