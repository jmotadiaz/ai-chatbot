import { User } from "next-auth";
import React from "react";
import { UserDropdown } from "@/components/layout/sidebar/user-dropdown";

interface UserMenuProps {
  user: User;
}

export const UserMenu: React.FC<UserMenuProps> = async ({ user }) => {
  if (!user.email) {
    return null;
  }

  return <UserDropdown email={user.email} />;
};
