"use client";
import { useSearchParams } from "next/navigation";
import { LogoIcon } from "@/components/ui/icons";

export interface ProjectOverviewProps {
  title?: string;
}

export const ProjectOverview = ({ title }: ProjectOverviewProps) => {
  const searchParams = useSearchParams();
  const chatType = searchParams.get("chatType");
  return (
    <div className="h-full flex flex-col items-center justify-end px-4">
      <h1 className="text-3xl text-center font-semibold mb-4 select-none">
        {title ? (
          title
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <LogoIcon className="mr-1" strokeWidth={2} size={42} /> Chatbot
            </div>
          </div>
        )}
        {chatType === "temporary" && (
          <div className="text-base text-zinc-500 dark:text-zinc-400">
            Temporary chat
          </div>
        )}
      </h1>
    </div>
  );
};
