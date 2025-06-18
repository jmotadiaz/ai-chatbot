import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth-config";
import {
  createProject,
  getProjectsByUserId,
  transaction,
} from "@/lib/db/queries";

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  defaultModel: z.string().optional(),
  defaultTemperature: z.number().min(0).max(1).optional(),
  defaultTopP: z.number().min(0).max(1).optional(),
  systemPrompt: z.string().min(1),
  metaPrompt: z.string().optional(),
  tools: z.array(z.string()).optional(),
});

const getProjectsSchema = z.object({
  limit: z
    .string()
    .transform(Number)
    .pipe(z.number().min(1).max(100))
    .optional(),
  offset: z.string().transform(Number).pipe(z.number().min(0)).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const validation = getProjectsSchema.safeParse({
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
    });

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: validation.error.issues },
        { status: 400 }
      );
    }

    const { limit = 50, offset = 0 } = validation.data;

    const projects = await getProjectsByUserId({
      userId: session.user.id,
      limit,
      offset,
    });

    revalidatePath("/");

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = createProjectSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.issues },
        { status: 400 }
      );
    }

    const project = await transaction(
      createProject({
        userId: session.user.id,
        ...validation.data,
      })
    );

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
