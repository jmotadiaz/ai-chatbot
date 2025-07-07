import { NextResponse } from "next/server";
import { deleteResources } from "@/lib/db/queries";

export async function GET() {
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
