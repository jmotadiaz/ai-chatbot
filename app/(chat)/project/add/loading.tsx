import { NewProject } from "@/app/(chat)/project/add/component";
import { SidebarContainer } from "@/components/layout/sidebar/container";

const Loading: React.FC = () => {
  return (
    <>
      <SidebarContainer />
      <NewProject />
    </>
  );
};

export default Loading;
