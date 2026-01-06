import { RAGManager } from "@/app/(chat)/rag/component";
import { Sidebar } from "@/components/layout/sidebar/sidebar";

const Loading: React.FC = () => {
  return (
    <>
      <Sidebar />
      <RAGManager />
    </>
  );
};

export default Loading;
