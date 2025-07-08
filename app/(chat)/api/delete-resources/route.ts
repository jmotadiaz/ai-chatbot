import { NextResponse } from "next/server";
import { deleteResources } from "@/lib/db/queries";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ status: 403 });
  }
  try {
    await deleteResources();

    return NextResponse.json({ result: "Resources deleted" }, { status: 200 });
  } catch {
    return NextResponse.json(
      { result: "Error deleting resources" },
      { status: 500 }
    );
  }
}
