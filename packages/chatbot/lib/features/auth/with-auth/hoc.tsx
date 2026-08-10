import { Session } from "next-auth";
import { redirect } from "next/navigation";
import React from "react";
import { getSession } from "@/lib/features/auth/cached-auth";

export interface Authenticated {
  user: NonNullable<Session["user"]>;
}

export function withAuth<P extends Authenticated>(
  Component: React.ComponentType<P>,
): React.ComponentType<Omit<P, keyof Authenticated>> {
  type PublicProps = Omit<P, keyof Authenticated>;

  async function WithAuth(props: PublicProps) {
    const session = await getSession();

    if (!session?.user) {
      redirect("/login");
    }

    const authenticatedProps = { ...props, user: session.user } as P;
    return <Component {...authenticatedProps} />;
  }

  return WithAuth;
}
