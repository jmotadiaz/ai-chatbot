/**
 * Type guard for membership in a `const` list. Shared so every mode/option
 * guard narrows the same way instead of casting the list at each call site.
 */
export const isOneOf = <T extends string>(
  values: readonly T[],
  value: unknown,
): value is T =>
  typeof value === "string" && (values as readonly string[]).includes(value);
