import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Main } from "@/components/ui/main";
import { SidebarProvider } from "@/app/providers";
import { fetchPublicModelCatalog } from "@/lib/infrastructure/ai/catalog";
import { ModelCatalogProvider } from "@/lib/features/foundation-model/model-catalog-context";

export interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = async ({ children }) => {
  // Hidratación del catálogo (ADR 0010, spec §5.3): el servidor descarga la
  // vista PÚBLICA del catálogo (los user-invocable; el Gateway ya filtra los
  // contratos `*-default` en servidor) y la hidrata en el árbol cliente. El
  // snapshot interno (contratos incluidos) que consumen los API routes vía
  // `getModelCatalogSnapshot` lo calienta `warmModelCatalog` por su cuenta.
  const catalog = await fetchPublicModelCatalog();

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
