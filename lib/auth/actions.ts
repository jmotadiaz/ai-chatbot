"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth/auth-config";
import { createUser, getUser, transaction } from "@/lib/db/queries";

const authFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export interface LoginActionState {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "invalid_credentials"
    | "invalid_data";
}

const redirectAfterLogin = (signInUrl: string) => {
  const callbackUrl = `${signInUrl}`.split("callbackUrl=")[1];

  if (callbackUrl) {
    redirect(decodeURIComponent(callbackUrl));
  }

  redirect("/");
};

export const login = async (
  _: unknown,
  formData: FormData
): Promise<LoginActionState> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let signInUrl: any;
  let signInStatus: LoginActionState = { status: "idle" };
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    signInUrl = await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });
    signInStatus = { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      signInStatus = { status: "invalid_data" };
    } else {
      signInStatus = { status: "invalid_credentials" };
    }
  }

  if (signInStatus.status === "success") {
    redirectAfterLogin(signInUrl);
  }

  return signInStatus;
};

export interface RegisterActionState {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "signup_failed"
    | "user_exists"
    | "invalid_data";
}

export const register = async (
  _: unknown,
  formData: FormData
): Promise<RegisterActionState> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let signInUrl: any;
  let signInStatus: RegisterActionState = { status: "idle" };
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const users = await getUser(validatedData.email);
    const [user] = users;

    if (!user) {
      await transaction(createUser(validatedData.email, validatedData.password));
      signInUrl = await signIn("credentials", {
        email: validatedData.email,
        password: validatedData.password,
        redirect: false,
      });
      signInStatus = { status: "success" };
    } else {
      signInStatus = { status: "user_exists" };
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      signInStatus = { status: "invalid_data" };
    } else {
      signInStatus = { status: "signup_failed" };
    }
  }

  if (signInStatus.status === "success") {
    redirectAfterLogin(signInUrl);
  }

  return signInStatus;
};
