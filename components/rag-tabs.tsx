"use client";

import { Tabs, useTabs } from "@/components/ui/tabs";

const TABS = ["upload", "resources"] as const;

interface RAGTabsProps {
  upload: React.ReactNode;
  resources: React.ReactNode;
}

export const RAGTabs: React.FC<RAGTabsProps> = ({ upload, resources }) => {
  const { getTabProps, getPanelProps } = useTabs({
    tabs: TABS,
  });

  return (
    <div className="w-full">
      <Tabs.Container>
        <Tabs.Tab {...getTabProps("upload")}>Upload</Tabs.Tab>
        <Tabs.Tab {...getTabProps("resources")}>Your Resources</Tabs.Tab>
      </Tabs.Container>
      <div className="mt-8">
        <Tabs.Panel {...getPanelProps("upload")}>{upload}</Tabs.Panel>
        <Tabs.Panel {...getPanelProps("resources")}>{resources}</Tabs.Panel>
      </div>
    </div>
  );
};
