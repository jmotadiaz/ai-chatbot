import RAGSkeleton from "@/components/rag-skeleton";
import { Sidebar } from "@/components/sidebar";

const Loading: React.FC = () => {
  return (
    <>
      <Sidebar />
      <RAGSkeleton />
    </>
  );
};

export default Loading;
