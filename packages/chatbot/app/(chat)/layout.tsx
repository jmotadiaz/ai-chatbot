import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Main } from "@/components/ui/main";
import { SidebarProvider } from "@/app/providers";
import { fetchPublicModelCatalog } from "@/lib/infrastructure/ai/catalog";
import { ModelCatalogProvider } from "@/lib/features/foundation-model/model-catalog-context";

export interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = async ({ children }) => {
  // Catalog hydration (ADR 0010, spec §5.3): the server fetches the
  // PUBLIC view of the catalog (the user-invocable ones; the Gateway already filters the
  // `*-default` contracts server-side) and hydrates it into the client tree. The
  // internal snapshot (contracts included) that the API routes consume via
  // `getModelCatalogSnapshot` is warmed by `warmModelCatalog` on its own.
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
