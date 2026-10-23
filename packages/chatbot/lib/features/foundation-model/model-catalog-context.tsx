"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { GatewayModelEntry } from "./config";

/**
 * Runtime model catalog for client components (ADR 0010): `(chat)/layout.tsx`
 * downloads it on the server and hydrates the tree with
 * `<ModelCatalogProvider catalog={...}>`; hooks and UI components read it
 * synchronously with `useModelCatalog()`.
 */

const ModelCatalogContext = createContext<GatewayModelEntry[] | null>(null);

export interface ModelCatalogProviderProps {
  catalog: GatewayModelEntry[];
  children: ReactNode;
}

export const ModelCatalogProvider: React.FC<ModelCatalogProviderProps> = ({
  catalog,
  children,
}) => (
  <ModelCatalogContext.Provider value={catalog}>
    {children}
  </ModelCatalogContext.Provider>
);

/**
 * Catalog hydrated from the server. Throws if the tree is not wrapped in
 * `<ModelCatalogProvider>` — the catalog has no reasonable default on the
 * client (an empty listing would break `defaultModel` with a more cryptic error).
 */
export function useModelCatalog(): GatewayModelEntry[] {
  const catalog = useContext(ModelCatalogContext);
  if (!catalog) {
    throw new Error(
      "useModelCatalog: no Model Catalog in context — wrap the tree with <ModelCatalogProvider catalog={...}> (see app/(chat)/layout.tsx)",
    );
  }
  return catalog;
}
