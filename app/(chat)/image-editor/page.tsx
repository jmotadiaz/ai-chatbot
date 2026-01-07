import { ImageEditorLayout } from "@/app/(chat)/image-editor/component";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { withAuth, AuthenticatedPage } from "@/lib/features/auth/with-auth";

const ImageEditorPage: React.FC<AuthenticatedPage> = async () => {
  return (
    <>
      <Sidebar />
      <ImageEditorLayout />
    </>
  );
};

export default withAuth(ImageEditorPage);
