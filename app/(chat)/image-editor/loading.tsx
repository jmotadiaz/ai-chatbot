import { ImageEditorLayout } from "@/app/(chat)/image-editor/component";
import { SidebarContainer } from "@/components/layout/sidebar/container";

const LoadingImageEditorPage: React.FC = () => {
  return (
    <>
      <SidebarContainer />
      <ImageEditorLayout />
    </>
  );
};

export default LoadingImageEditorPage;
