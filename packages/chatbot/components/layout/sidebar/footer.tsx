export interface SidebarFooterProps {
  children: React.ReactNode;
}

export const SidebarFooter = ({ children }: SidebarFooterProps) => {
  return <div className="relative px-4 w-80 p-4">{children}</div>;
};

