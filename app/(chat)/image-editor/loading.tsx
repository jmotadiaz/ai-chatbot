import { ImageEditorLayout } from "@/app/(chat)/image-editor/component";
import { Sidebar } from "@/components/layout/sidebar/sidebar";

const LoadingImageEditorPage: React.FC = () => {
  return (
    <>
      <Sidebar />
      <ImageEditorLayout />;
    </>
  );
};

export default LoadingImageEditorPage;
