
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { saveUrlResource } from "@/lib/ai/rag/pipelines";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const jsonFile = formData.get("jsonFile") as File;
    const url = formData.get("url") as string;
    const container = formData.get("container") as string | undefined;
    const excludeSelectors = formData.get("excludeSelectors") as string | undefined;

    if (!jsonFile && !url) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    let resourcesCreated = 0;

    if (url) {
      const { success } = await saveUrlResource({
        url,
        container,
        excludeSelectors: excludeSelectors
          ? excludeSelectors.split(",").map((s) => s.trim())
          : undefined,
      }, session.user.id);

      if (success) {
        resourcesCreated++;
      }
    }

    // Process JSON file with URLs if provided
    if (jsonFile) {
      const fileContent = await jsonFile.text();
      let jsonData;

      try {
        jsonData = JSON.parse(fileContent);
      } catch {
        return NextResponse.json({ error: "Invalid JSON file" }, { status: 400 });
      }

      if (!jsonData.urls || !Array.isArray(jsonData.urls)) {
        return NextResponse.json({ error: "JSON must contain 'urls' array" }, { status: 400 });
      }

      const { urls, container: jsonContainer, excludeSelectors: jsonExcludeSelectors } = jsonData as {
        urls: string[];
        container?: string;
        excludeSelectors?: string[];
      };

      if (urls.length === 0) {
        return NextResponse.json({ error: "No URLs provided in JSON file" }, { status: 400 });
      }

      if (process.env.NODE_ENV === "production" && urls.length > 200) {
        return NextResponse.json({ error: "Max 200 URLs" }, { status: 400 });
      }

      console.log(`Processing ${urls.length} URLs...`);

      for (const url of urls) {
        const { success } = await saveUrlResource(
          {
            url,
            container: jsonContainer,
            excludeSelectors: jsonExcludeSelectors,
          },
          session.user.id
        );
        if (success) {
          resourcesCreated++;
        }
      }
    }

    console.log(`Completed: ${resourcesCreated} resources`);

    return NextResponse.json({
      success: true,
      resourcesCreated,
    });
  } catch (error) {
    console.error("Error in uploadRAGResources:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }, { status: 500 });
  }
}
