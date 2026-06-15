import React, { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import { cn } from "@/lib/utils/helpers";

export interface ContainerProps {
  className?: string;
  children: React.ReactNode;
}

const Container: React.FC<ContainerProps> = ({ className, children }) => {
  return (
    <div className={cn("flex w-full border-b-2", className)}>{children}</div>
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
        "px-4 py-2 relative top-[2px] border-b-2 font-semibold transition-colors duration-300 select-none",
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
  value: string;
  className?: string;
  hasChangedTab?: boolean;
}

const Panel: React.FC<PanelProps> = ({
  children,
  active,
  value,
  className,
  hasChangedTab,
}) => {
  if (!active) return null;

  return (
    <AnimatePresence key={value}>
      <motion.div
        {...(hasChangedTab && {
          initial: { x: 20, opacity: 0 },
          animate: { x: 0, opacity: 1 },
          exit: { x: 20, opacity: 0 },
          transition: { duration: 0.3, ease: "easeInOut" },
        })}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
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
  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    parseAsStringLiteral(tabs).withDefault(initialTab)
  );
  const hasChangedTab = useRef(false);

  const handleTabClick = (tab: T) => {
    setActiveTab(tab);
    hasChangedTab.current = true;
  };

  const getTabProps = (tab: T) => ({
    active: activeTab === tab,
    onClick: () => handleTabClick(tab),
  });

  const getPanelProps = (tab: T) => ({
    active: activeTab === tab,
    value: tab,
    hasChangedTab: hasChangedTab.current,
  });

  return {
    getTabProps,
    getPanelProps,
    activeTab,
  };
};
