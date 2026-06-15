export const SidebarSectionTitle: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <h3 className="text-sm uppercase flex items-center font-medium text-zinc-500 dark:text-zinc-300 mb-4 tracking-widest">
      {children}
    </h3>
  );
};

