import { Sidebar } from "../../sidebar";
import { AuthCheck } from "@/components/auth/check";
import { NewProject } from "@/app/(chat)/project/add/component";

const NewProjectPage: React.FC = async () => {
  return (
    <>
      <AuthCheck />
      <Sidebar />
      <NewProject />
    </>
  );
};

export default NewProjectPage;
