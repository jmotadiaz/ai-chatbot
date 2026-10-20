"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { GatewayModelEntry } from "./config";

/**
 * Runtime catálogo de modelos para componentes cliente (ADR 0010): el
 * `(chat)/layout.tsx` lo descarga en el servidor y hidrata el árbol con
 * `<ModelCatalogProvider catalog={...}>`; los hooks y componentes de UI lo
 * leen síncronamente con `useModelCatalog()`.
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
 * Catálogo hidratado desde el servidor. Lanza si el árbol no está envuelto
 * en `<ModelCatalogProvider>` — el catálogo no tiene default razonable en el
 * cliente (un listado vacío rompería `defaultModel` con un error más críptico).
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
