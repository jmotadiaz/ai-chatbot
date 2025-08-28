import { unstable_ViewTransition as ViewTransition } from "react";
import { Main } from "@/components/ui/main";

export interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <ViewTransition>
      <Main>{children}</Main>
    </ViewTransition>
  );
};

export default Layout;
