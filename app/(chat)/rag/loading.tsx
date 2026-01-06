import { RAGManager } from "@/app/(chat)/rag/component";
import { SidebarContainer } from "@/components/layout/sidebar/container";

const Loading: React.FC = () => {
  return (
    <>
      <SidebarContainer />
      <RAGManager />
    </>
  );
};

export default Loading;
