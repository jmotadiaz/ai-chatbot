"use client";

import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { register } from "../actions";

export default function Page() {
  return (
    <div className="relative flex h-dvh w-screen items-start pt-12 md:pt-0 md:items-center justify-center bg-background">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md overflow-hidden rounded-2xl gap-6 flex flex-col">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="text-xl font-semibold dark:text-zinc-50">Sign Up</h3>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Create an account with your email and password
          </p>
        </div>
        <AuthForm action={register}>Sign Up</AuthForm>
        <p className="text-center text-sm text-gray-600 mt-4 dark:text-zinc-400">
          {"Already have an account? "}
          <Link
            href="/login"
            className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
          >
            Sign in
          </Link>
          {" instead."}
        </p>
      </div>
    </div>
  );
}
