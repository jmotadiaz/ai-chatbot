import { auth } from "../lib/auth/auth-config";
import { redirect } from "next/navigation";
import { UserDropdown } from "./user-dropdown";
export const UserMenu = async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.email) {
    return null;
  }

  return <UserDropdown email={session.user.email} />;
};
