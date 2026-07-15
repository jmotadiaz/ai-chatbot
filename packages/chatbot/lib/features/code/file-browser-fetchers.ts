import type {
  ChangesResult,
  FileContentResult,
  FileEntry,
} from "@/components/code/file-browser/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function fetchPath(
  project: string,
  path: string,
): Promise<FileContentResult> {
  const params = new URLSearchParams({ path });
  return getJson<FileContentResult>(
    `/api/agent/code/${encodeURIComponent(project)}/files?${params}`,
  );
}

export async function fetchDir(
  project: string,
  path: string,
): Promise<FileEntry[]> {
  const result = await fetchPath(project, path);
  if (result.kind !== "dir") {
    throw new Error("Not a directory");
  }
  return result.entries;
}

export async function fetchFile(
  project: string,
  path: string,
): Promise<Exclude<FileContentResult, { kind: "dir" }>> {
  const result = await fetchPath(project, path);
  if (result.kind === "dir") {
    throw new Error("Not a file");
  }
  return result;
}

export async function fetchChanges(project: string): Promise<ChangesResult> {
  return getJson<ChangesResult>(
    `/api/agent/code/${encodeURIComponent(project)}/changes`,
  );
}
