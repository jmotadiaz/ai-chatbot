"use client";

import * as React from 'react';
import { Button } from '@/components/ui/button';

interface SubmitButtonProps {
  /** Whether the submission was successful; disables the button when true */
  isSuccessful: boolean;
  children: React.ReactNode;
}

/**
 * SubmitButton wraps a UI Button for form submissions,
 * disabling itself when the action completes successfully.
 */
export function SubmitButton({ isSuccessful, children }: SubmitButtonProps) {
  return (
    <Button type="submit" disabled={isSuccessful}>
      {children}
    </Button>
  );
}