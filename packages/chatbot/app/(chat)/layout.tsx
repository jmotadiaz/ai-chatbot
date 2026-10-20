import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Main } from "@/components/ui/main";
import { SidebarProvider } from "@/app/providers";
import { fetchModelCatalog } from "@/lib/infrastructure/ai/catalog";
import { ModelCatalogProvider } from "@/lib/features/foundation-model/model-catalog-context";

export interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = async ({ children }) => {
  // Punto de calentamiento del catálogo (ADR 0010): el servidor descarga el
  // catálogo del Gateway y lo hidrata en el árbol cliente; el mismo caché
  // (TTL 60 s) es el que consumen los API routes vía `getModelCatalogSnapshot`.
  const catalog = await fetchModelCatalog();

  return (
    <Main>
      <NuqsAdapter>
        <ModelCatalogProvider catalog={catalog}>
          <SidebarProvider>{children}</SidebarProvider>
        </ModelCatalogProvider>
      </NuqsAdapter>
    </Main>
  );
};

export default Layout;
