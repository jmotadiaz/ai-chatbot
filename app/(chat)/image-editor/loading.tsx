import { ImageEditorLayout } from "@/app/(chat)/image-editor/component";
import { Sidebar } from "@/components/sidebar";

const LoadingImageEditorPage: React.FC = () => {
  return (
    <>
      <Sidebar />
      <ImageEditorLayout />;
    </>
  );
};

export default LoadingImageEditorPage;
