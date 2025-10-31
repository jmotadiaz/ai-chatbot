import ImageEditorSkeleton from "@/components/image-editor-skeleton";
import { Sidebar } from "@/components/sidebar";

const Loading: React.FC = () => {
  return (
    <>
      <Sidebar />
      <ImageEditorSkeleton />
    </>
  );
};

export default Loading;
