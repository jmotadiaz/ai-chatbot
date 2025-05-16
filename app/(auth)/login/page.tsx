import { AuthForm } from "@/components/auth-form";
import { ThemeToggle } from "../../../components/theme-toggle";
import Link from "next/link";
import { login } from "../actions";
import { auth } from "../auth";
import { redirect } from "next/navigation";

export default async function Page() {
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
        <p className="text-center text-sm text-gray-600 dark:text-zinc-400">
          {"Don't have an account? "}
          <Link
            href="/register"
            className=" font-semibold text-gray-800 hover:underline dark:text-zinc-200"
          >
            Sign up
          </Link>
          {" instead."}
        </p>
      </div>
    </div>
  );
}
