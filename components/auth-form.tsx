"use client";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "./ui/button";
import { LoginActionState, RegisterActionState } from "../app/(auth)/actions";
import { toast } from "sonner";

interface AuthFormProps {
  /** Function to handle form submission, receives FormData */
  action: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _: any,
    formData: FormData
  ) => Promise<LoginActionState | RegisterActionState>;
  /** Default email to prefill the email input */
  defaultEmail?: string;
  children: React.ReactNode;
}

/**
 * AuthForm renders a form with email and password fields,
 * and invokes the provided action on submit.
 */
export function AuthForm({ action, children }: AuthFormProps) {
  const [state, formAction, pending] = React.useActionState(action, {
    status: "idle",
  });

  React.useEffect(() => {
    if (state.status === "invalid_credentials") {
      toast.error("Invalid credentials!");
    } else if (state.status === "invalid_data") {
      toast.error("Failed validating your submission!");
    } else if (state.status === "user_exists") {
      toast.error("Account already exists!");
    } else if (state.status === "signup_failed") {
      toast.error("Failed to create account!");
    }
  }, [state.status]);

  return (
    <form action={formAction} className="flex flex-col gap-4 px-4 sm:px-16">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input type="email" name="email" id="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input type="password" name="password" id="password" required />
      </div>
      <div className="flex flex-col gap-2 mt-2 items-center">
        <Button type="submit" disabled={pending}>
          {children}
        </Button>
      </div>
    </form>
  );
}
