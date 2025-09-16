import { ImageEditorLayout } from "@/app/(chat)/image-editor/component";
import { Sidebar } from "@/app/(chat)/sidebar";

const ImageEditorPage: React.FC = () => {
  return (
    <>
      <Sidebar />
      <ImageEditorLayout />
    </>
  );
};

export default ImageEditorPage;
