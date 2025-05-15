"use client";

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AuthFormProps {
  /** Function to handle form submission, receives FormData */
  action: (formData: FormData) => void;
  /** Default email to prefill the email input */
  defaultEmail?: string;
  children: React.ReactNode;
}

/**
 * AuthForm renders a form with email and password fields,
 * and invokes the provided action on submit.
 */
export function AuthForm({ action, defaultEmail, children }: AuthFormProps) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    action(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 sm:px-16">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          type="email"
          name="email"
          id="email"
          defaultValue={defaultEmail}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          type="password"
          name="password"
          id="password"
          required
        />
      </div>
      <div className="flex flex-col gap-2 items-center">
        {children}
      </div>
    </form>
  );
}