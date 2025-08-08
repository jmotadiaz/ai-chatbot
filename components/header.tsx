export interface HeaderContainerProps {
  children?: React.ReactNode;
}

const Container: React.FC<HeaderContainerProps> = ({ children }) => {
  return (
    <div className="fixed right-0 left-0 w-full top-0 bg-(--background) z-30 shadow-md">
      <div className="flex justify-between items-center py-4 px-6 lg:px-10">
        {children}
      </div>
    </div>
  );
};

export interface HeaderLeftProps {
  children?: React.ReactNode;
}

const Left: React.FC<HeaderLeftProps> = ({ children }) => {
  return (
    <div className="flex flex-row items-center gap-2 lg:gap-6 shrink-0">
      {children}
    </div>
  );
};

export interface HeaderRightProps {
  children?: React.ReactNode;
}

const Right: React.FC<HeaderRightProps> = function HeaderRight({ children }) {
  return (
    <div className="flex flex-row items-center gap-2 shrink-0">{children}</div>
  );
};

export interface Header {
  Container: React.FC<HeaderContainerProps>;
  Left: React.FC<HeaderLeftProps>;
  Right: React.FC<HeaderRightProps>;
}

export const Header: Header = {
  Container,
  Left,
  Right,
};
