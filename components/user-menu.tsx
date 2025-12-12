import { redirect } from "next/navigation";
import { auth } from "@/lib/features/auth/auth-config";
import { UserDropdown } from "@/components/user-dropdown";
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
