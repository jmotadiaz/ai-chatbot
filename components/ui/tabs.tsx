import React, { startTransition, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import { cn } from "@/lib/utils";

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
  mounted: boolean;
}

const Panel: React.FC<PanelProps> = ({ children, active, value, mounted }) => {
  if (!active) return null;
  if (!mounted) return <>{children}</>;

  return <InternalPanel value={value}>{children}</InternalPanel>;
};

const InternalPanel: React.FC<Pick<PanelProps, "value" | "children">> = ({
  children,
  value,
}) => {
  return (
    <AnimatePresence key={value}>
      <motion.div
        initial={{ x: 20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 20, opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
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

  // Track transition count to ensure unique keys even when returning to a tab
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
  }, []);

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
    value: tab,
    mounted: mounted.current,
  });

  return {
    getTabProps,
    getPanelProps,
    activeTab,
  };
};
