import { NewProject } from "./component";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { withAuth, Authenticated } from "@/lib/features/auth/with-auth/hoc";

const AddProjectPage: React.FC<Authenticated> = ({ user }) => {
  return (
    <>
      <Sidebar user={user} />
      <NewProject />
    </>
  );
};

export default withAuth(AddProjectPage);
