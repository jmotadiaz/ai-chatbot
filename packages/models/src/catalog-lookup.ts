/**
 * Resolves `key` — a Model Role from `roles`, or a raw catalog id — to its
 * entry in `catalog`, throwing a descriptive error when the resolved id has
 * no entry. This is the "resolve role-or-id, look it up by id, throw if
 * missing" sequence every operation catalog repeated on its own before this
 * helper existed: `packages/inference/src/{language-model,speech-model,
 * decide,embed,rerank}.ts`, and, pre-existing, the chatbot's own
 * `lib/features/foundation-model/config.ts` (id-only, no roles there).
 *
 * `roles` is optional: pass it whenever `key` may be a role name that needs
 * translating to a catalog id first. Embedding and rerank only ever address
 * their catalog by role (there is no raw-id form for those two operations at
 * the type level), so their callers still pass a roles map — the runtime
 * shape is identical to an id-or-role lookup, just with `key` always
 * resolving through it. Omit `roles` for a plain id-only lookup.
 *
 * Uses `Object.prototype.hasOwnProperty` (not a plain `roles[key]` read) so a
 * key that happens to collide with an `Object.prototype` member name (e.g.
 * `"constructor"`) is never mistaken for a role.
 */
export function resolveCatalogEntry<
  TId extends string,
  TEntry,
  TRole extends string = never,
>(
  catalog: Map<TId, TEntry>,
  key: TId | TRole,
  description: { kind: string; catalogName: string },
  roles?: Record<TRole, TId>,
): { id: TId; entry: TEntry } {
  const isRole =
    roles !== undefined && Object.prototype.hasOwnProperty.call(roles, key);
  const id = (isRole ? roles![key as TRole] : key) as TId;
  const entry = catalog.get(id);

  if (!entry) {
    const detail =
      (id as string) === (key as string)
        ? `"${id}"`
        : `"${key}" (resolved to "${id}")`;
    throw new Error(
      `${description.kind} ${detail} not found in ${description.catalogName}`,
    );
  }

  return { id, entry };
}
