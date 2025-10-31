import EnglishHelperSkeleton from "@/components/english-helper-skeleton";
import { Sidebar } from "@/components/sidebar";

const Loading: React.FC = () => {
  return (
    <>
      <Sidebar />
      <EnglishHelperSkeleton />
    </>
  );
};

export default Loading;
