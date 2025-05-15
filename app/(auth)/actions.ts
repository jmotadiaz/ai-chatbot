"use server";

import { z } from "zod";
import { createUser, getUser } from "@/lib/db/queries";
import { signIn } from "./auth";

const authFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export interface LoginActionState {
  status: "idle" | "in_progress" | "success" | "failed" | "invalid_data";
}

export const login = async (formData: FormData): Promise<void> => {
  const validatedData = authFormSchema.parse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  await signIn("credentials", {
    email: validatedData.email,
    password: validatedData.password,
    redirectTo: "/",
  });
};

export interface RegisterActionState {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "failed"
    | "user_exists"
    | "invalid_data";
}

export const register = async (formData: FormData): Promise<void> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const [user] = await getUser(validatedData.email);

    if (!user) {
      await createUser(validatedData.email, validatedData.password);
      await signIn("credentials", {
        email: validatedData.email,
        password: validatedData.password,
        redirectTo: "/",
      });
    }
  } catch {}
};
