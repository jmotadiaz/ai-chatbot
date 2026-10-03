import { describe, expect, it } from "vitest";
import { resolveCatalogEntry } from "./catalog-lookup";

interface Entry {
  id: string;
  label: string;
}

type Id = "model-a" | "model-b";
type Role = "primary";
/** A key that is neither a declared `Id` nor a declared `Role` — cast the same way the real call sites' own "not a real id/role" tests do (e.g. `kit.languageModel("not-a-real-model" as ModelId)`), to exercise the runtime check the static type normally rules out. */
type BadKey = Id | Role;

const catalog = new Map<Id, Entry>([
  ["model-a", { id: "model-a", label: "A" }],
  ["model-b", { id: "model-b", label: "B" }],
]);

const roles: Record<Role, Id> = { primary: "model-a" };

const description = { kind: "Thing", catalogName: "THINGS" };

describe("resolveCatalogEntry", () => {
  it("resolves a raw id directly", () => {
    expect(resolveCatalogEntry(catalog, "model-b", description)).toEqual({
      id: "model-b",
      entry: { id: "model-b", label: "B" },
    });
  });

  it("resolves a role to its catalog id and entry", () => {
    expect(resolveCatalogEntry(catalog, "primary", description, roles)).toEqual({
      id: "model-a",
      entry: { id: "model-a", label: "A" },
    });
  });

  it("throws naming just the key when it is not a known role and not a catalog id", () => {
    expect(() =>
      resolveCatalogEntry(catalog, "not-a-real-key" as BadKey, description, roles),
    ).toThrow('Thing "not-a-real-key" not found in THINGS');
  });

  it("throws naming both the role and the id it resolved to when that id is missing from the catalog", () => {
    const staleRoles = { primary: "missing-id" as Id } satisfies Record<Role, Id>;

    expect(() =>
      resolveCatalogEntry(catalog, "primary", description, staleRoles),
    ).toThrow('Thing "primary" (resolved to "missing-id") not found in THINGS');
  });

  it("never mistakes an Object.prototype member name for a matching role", () => {
    expect(() =>
      resolveCatalogEntry(catalog, "constructor" as BadKey, description, roles),
    ).toThrow('Thing "constructor" not found in THINGS');
  });

  it("does not require a roles map for a plain id-only lookup", () => {
    expect(resolveCatalogEntry(catalog, "model-a", description)).toEqual({
      id: "model-a",
      entry: { id: "model-a", label: "A" },
    });
  });
});
