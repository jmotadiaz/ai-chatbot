import { describe, expect, it } from "vitest";
import { MODEL_CATALOG, type ModelCatalogEntry } from "models";
import {
  ALIAS_BEHAVIOURS,
  CAPABILITY_ALIASES,
  type CapabilityAlias,
} from "@/tests/mocks/ai/capabilities";

/**
 * Guards the assumptions CAPABILITY_ALIASES makes about MODEL_CATALOG (see
 * that file's `requires` docs). A catalog edit that breaks one of these
 * assumptions must fail here, loudly, naming the alias and the property it
 * broke — not silently in e2e.
 *
 * Typed explicitly as `Map<string, ModelCatalogEntry>`: MODEL_CATALOG's own
 * `as const satisfies readonly ModelCatalogEntry[]` gives each entry its own
 * narrow literal type, and a plain `.find()`/`.map()` over it would infer a
 * union of those (so e.g. `.supportedFiles` would not exist on the union
 * members that omit it). Widening to `ModelCatalogEntry` up front — the
 * general interface, where every field this test reads is optional — is the
 * same fix `packages/inference/src/language-model.ts` uses.
 */
const catalogById = new Map<string, ModelCatalogEntry>(
  MODEL_CATALOG.map((entry) => [entry.id, entry]),
);

const aliases = Object.keys(CAPABILITY_ALIASES) as CapabilityAlias[];

describe("CAPABILITY_ALIASES invariants", () => {
  it("each alias's requires holds against its Model Catalog entry", () => {
    for (const alias of aliases) {
      const { id, requires } = CAPABILITY_ALIASES[alias];
      const entry = catalogById.get(id);
      expect(
        entry,
        `alias "${alias}": requires.id -> catalog entry "${id}" not found in MODEL_CATALOG`,
      ).toBeDefined();
      if (!entry) continue;

      if (requires.imageInput) {
        expect(
          entry.supportedFiles?.includes("img"),
          `alias "${alias}": requires.imageInput but catalog entry "${id}" has supportedFiles=${JSON.stringify(entry.supportedFiles)} (missing "img")`,
        ).toBe(true);
      }

      if (requires.reasoning) {
        expect(
          entry.reasoning,
          `alias "${alias}": requires.reasoning but catalog entry "${id}" has reasoning=${JSON.stringify(entry.reasoning)}`,
        ).toBe(true);
      }

      if (requires.distinctTemperatureFrom) {
        const otherAlias = requires.distinctTemperatureFrom;
        const isKnownAlias = (aliases as string[]).includes(otherAlias);
        expect(
          isKnownAlias,
          `alias "${alias}": requires.distinctTemperatureFrom references unknown alias "${otherAlias}"`,
        ).toBe(true);

        const other = isKnownAlias
          ? CAPABILITY_ALIASES[otherAlias as CapabilityAlias]
          : undefined;
        const otherEntry = other && catalogById.get(other.id);
        expect(
          otherEntry,
          `alias "${alias}": requires.distinctTemperatureFrom("${otherAlias}")'s catalog entry not found in MODEL_CATALOG`,
        ).toBeDefined();

        expect(
          entry.temperature,
          `alias "${alias}": requires.distinctTemperatureFrom("${otherAlias}") but catalog entry "${id}" has the same temperature (${JSON.stringify(entry.temperature)}) as "${other?.id}"`,
        ).not.toBe(otherEntry?.temperature);
      }
    }
  });

  it("each alias points to a distinct catalog model", () => {
    const aliasById = new Map<string, CapabilityAlias>();
    for (const alias of aliases) {
      const { id } = CAPABILITY_ALIASES[alias];
      const clashingAlias = aliasById.get(id);
      expect(
        clashingAlias,
        `alias "${alias}": catalog id "${id}" is also used by alias "${clashingAlias}" — aliases must point to distinct models`,
      ).toBeUndefined();
      aliasById.set(id, alias);
    }
  });

  it("a behaviour is registered in ALIAS_BEHAVIOURS if and only if the alias is not plainMock", () => {
    for (const alias of aliases) {
      const { requires } = CAPABILITY_ALIASES[alias];
      const behaviour = ALIAS_BEHAVIOURS[alias];

      if (requires.plainMock) {
        expect(
          behaviour,
          `alias "${alias}": requires.plainMock but a behaviour is registered for it in ALIAS_BEHAVIOURS`,
        ).toBeUndefined();
      } else {
        expect(
          behaviour,
          `alias "${alias}": no requires.plainMock but no behaviour is registered for it in ALIAS_BEHAVIOURS either`,
        ).toBeDefined();
      }
    }
  });
});
