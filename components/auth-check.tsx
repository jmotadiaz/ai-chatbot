import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";

const _AuthCheck: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return null;
};

export const AuthCheck: React.FC = () => {
  return (
    <Suspense fallback={null}>
      <_AuthCheck />
    </Suspense>
  );
};
