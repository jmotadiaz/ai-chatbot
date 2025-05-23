export interface HeaderProps {
  children?: React.ReactNode;
}

export const Header = ({ children }: HeaderProps) => {
  return (
    <div className="fixed right-0 left-0 w-full top-0 bg-(--background) z-30 shadow-md">
      <div className="flex justify-between items-center py-4 px-10">
        {children}
      </div>
    </div>
  );
};
