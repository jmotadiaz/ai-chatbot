import { ChatHomeComponent } from "@/app/(chat)/(home)/component";
import { SidebarContainer } from "@/components/layout/sidebar/container";

const Loading: React.FC = () => {
  return (
    <>
      <SidebarContainer />
      <ChatHomeComponent />
    </>
  );
};

export default Loading;
