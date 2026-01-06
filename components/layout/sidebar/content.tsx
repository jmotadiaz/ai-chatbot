interface SidebarContentProps {
  children: React.ReactNode;
}

export const SidebarContent = ({ children }: SidebarContentProps) => {
  return (
    <div className="flex-1 px-4 w-80 overflow-auto scrollbar-none">
      {children}
    </div>
  );
};

