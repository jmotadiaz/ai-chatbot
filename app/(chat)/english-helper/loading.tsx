import { EnglishHelper } from "@/app/(chat)/english-helper/component";
import { Sidebar } from "@/components/sidebar";

const Loading: React.FC = () => {
  return (
    <>
      <Sidebar />
      <EnglishHelper />
    </>
  );
};

export default Loading;
