import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { modelID } from "@/app/(chat)/providers";
import { ModelPicker } from "./model-picker";
import { Edit } from "lucide-react";

interface HeaderProps {
  selectedModel: modelID;
  setSelectedModel: (model: modelID) => void;
  /** Clear the current conversation and start a new chat */
  onNewChat: () => void;
  onClickLogo?: () => void;
}

export const Header = ({
  selectedModel,
  setSelectedModel,
  onNewChat,
  onClickLogo,
}: HeaderProps) => {
  return (
    <div className="fixed right-0 left-0 w-full top-0 bg-(--background) z-30 shadow-md">
      <div className="flex justify-between items-center py-4 px-10">
        {/* Left: Logo and model picker */}
        <div className="flex flex-row items-center gap-6 shrink-0">
          <span className="flex flex-row items-center gap-2 home-links">
            <div
              className="text-zinc-800 dark:text-zinc-100 -translate-y-[.5px] cursor-pointer"
              onClick={onClickLogo}
            >
              <svg
                data-testid="geist-icon"
                height={18}
                strokeLinejoin="round"
                viewBox="0 0 16 16"
                width={18}
                style={{ color: "currentcolor" }}
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M8 1L16 15H0L8 1Z"
                  fill="currentColor"
                />
              </svg>
            </div>
          </span>
          <Button
            onClick={onNewChat}
            variant="outline"
            size="sm"
            className="h-8 px-3 text-zinc-700 dark:text-zinc-200 border-none cursor-pointer"
          >
            <Edit />
          </Button>
          <ModelPicker
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            triggerClassName="h-8 px-3 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-md shadow-sm"
          />
        </div>
        {/* Right: Theme toggle only */}
        <div className="flex flex-row items-center gap-2 shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
};
