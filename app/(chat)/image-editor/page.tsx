import { ImageEditorLayout } from "@/app/(chat)/image-editor/component";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { withAuth, Authenticated } from "@/lib/features/auth/with-auth";

const ImageEditorPage: React.FC<Authenticated> = async ({ user }) => {
  return (
    <>
      <Sidebar user={user} />
      <ImageEditorLayout />
    </>
  );
};

export default withAuth(ImageEditorPage);
