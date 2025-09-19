import { unstable_ViewTransition as ViewTransition } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Main } from "@/components/ui/main";
import { SidebarProvider } from "@/app/providers";

export interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <ViewTransition enter={"fade-in"} exit={"fade-out"}>
      <Main>
        <NuqsAdapter>
          <SidebarProvider>{children}</SidebarProvider>
        </NuqsAdapter>
      </Main>
    </ViewTransition>
  );
};

export default Layout;
