import { NextResponse } from "next/server";
import { auth } from "@/lib/features/auth/auth-config";

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Deprecated: attachments are managed locally as data-URLs.
  return NextResponse.json({ ok: true });
}
