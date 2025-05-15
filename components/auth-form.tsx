import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "./ui/button";

interface AuthFormProps {
  /** Function to handle form submission, receives FormData */
  action: (formData: FormData) => Promise<void>;
  /** Default email to prefill the email input */
  defaultEmail?: string;
  children: React.ReactNode;
}

/**
 * AuthForm renders a form with email and password fields,
 * and invokes the provided action on submit.
 */
export function AuthForm({ action, children }: AuthFormProps) {
  return (
    <form action={action} className="flex flex-col gap-4 px-4 sm:px-16">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input type="email" name="email" id="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input type="password" name="password" id="password" required />
      </div>
      <div className="flex flex-col gap-2 mt-2 items-center">
        <Button type="submit">{children}</Button>
      </div>
    </form>
  );
}
