import { EnglishHelper } from "@/app/(chat)/english-helper/component";
import { Sidebar } from "@/components/layout/sidebar/sidebar";

const Loading: React.FC = () => {
  return (
    <>
      <Sidebar />
      <EnglishHelper />
    </>
  );
};

export default Loading;
