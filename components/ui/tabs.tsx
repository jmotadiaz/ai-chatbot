import React, {
  startTransition,
  useState,
  unstable_ViewTransition as ViewTransition,
} from "react";
import { cn } from "../../lib/utils";

export interface ContainerProps {
  className?: string;
  children: React.ReactNode;
}

const Container: React.FC<ContainerProps> = ({ className, children }) => {
  return (
    <div className={cn("flex w-full border-b px-6", className)}>{children}</div>
  );
};

export interface TabProps {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}

const Tab: React.FC<TabProps> = ({ children, active, onClick }) => {
  return (
    <button
      type="button"
      className={cn(
        "px-4 py-2 border-b-2 font-medium transition-colors duration-300",
        active
          ? "border-primary text-primary"
          : "border-transparent text-gray-500 cursor-pointer"
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

export interface PanelProps {
  children: React.ReactNode;
  active: boolean;
}

const Panel: React.FC<PanelProps> = ({ children, active }) => {
  return active ? (
    <ViewTransition enter="slide-in" exit="slide-out">
      <div>{children}</div>
    </ViewTransition>
  ) : null;
};

export interface Tabs {
  Container: React.FC<ContainerProps>;
  Tab: React.FC<TabProps>;
  Panel: React.FC<PanelProps>;
}

export const Tabs: Tabs = {
  Container,
  Tab,
  Panel,
};

export interface UseTabsParams<T extends string> {
  initialTab?: T;
  tabs: Readonly<T[]>;
}

export interface UseTabsReturn<T extends string> {
  getTabProps(tab: T): Omit<TabProps, "children">;
  getPanelProps(tab: T): Omit<PanelProps, "children">;
  activeTab: T;
}

export const useTabs = <T extends string>({
  tabs,
  initialTab = tabs[0],
}: UseTabsParams<T>): UseTabsReturn<T> => {
  const [activeTab, setActiveTab] = useState<T>(() => initialTab);

  const handleTabClick = (tab: T) => {
    startTransition(() => {
      setActiveTab(tab);
    });
  };

  const getTabProps = (tab: T) => ({
    active: activeTab === tab,
    onClick: () => handleTabClick(tab),
  });

  const getPanelProps = (tab: T) => ({
    active: activeTab === tab,
  });

  return {
    getTabProps,
    getPanelProps,
    activeTab,
  };
};
