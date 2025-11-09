import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Main } from "@/components/ui/main";
import { SidebarProvider } from "@/app/providers";

export interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <Main>
      <NuqsAdapter>
        <SidebarProvider>{children}</SidebarProvider>
      </NuqsAdapter>
    </Main>
  );
};

export default Layout;
