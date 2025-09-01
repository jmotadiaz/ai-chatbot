import { SidebarProvider } from "../../../providers";
import { Sidebar } from "../../sidebar";
import { AuthCheck } from "@/components/auth-check";
import { NewProject } from "@/app/(chat)/project/add/component";

const NewProjectPage: React.FC = async () => {
  return (
    <SidebarProvider>
      <AuthCheck />
      <Sidebar />
      <NewProject />
    </SidebarProvider>
  );
};

export default NewProjectPage;
