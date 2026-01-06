import { ImageEditorLayout } from "@/app/(chat)/image-editor/component";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { AuthCheck } from "@/components/auth/check";

const ImageEditorPage: React.FC = () => {
  return (
    <>
      <AuthCheck />
      <Sidebar />
      <ImageEditorLayout />
    </>
  );
};

export default ImageEditorPage;
