import React from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/form";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { auth } from "@/lib/features/auth/auth-config";
import { login } from "@/lib/features/auth/actions";

const Page: React.FC = async () => {
  const session = await auth();
  if (session) {
    redirect("/");
  }
  return (
    <div className="relative flex h-dvh w-screen items-start pt-12 md:pt-0 md:items-center justify-center bg-background">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md overflow-hidden rounded-2xl gap-6 flex flex-col">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="text-xl font-semibold dark:text-zinc-50">Sign in</h3>
        </div>
        <AuthForm action={login}>Sign in</AuthForm>
      </div>
    </div>
  );
};

export default Page;
