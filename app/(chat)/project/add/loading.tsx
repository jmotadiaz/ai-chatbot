import { NewProject } from "@/app/(chat)/project/add/component";
import { Sidebar } from "@/components/sidebar";

const Loading: React.FC = () => {
  return (
    <>
      <Sidebar />
      <NewProject />
    </>
  );
};

export default Loading;
