import { redirect } from "next/navigation";
import { ImageEditorLayout } from "@/app/(chat)/image-editor/component";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { auth } from "@/lib/features/auth/auth-config";

const ImageEditorPage: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <>
      <Sidebar />
      <ImageEditorLayout />
    </>
  );
};

export default ImageEditorPage;
