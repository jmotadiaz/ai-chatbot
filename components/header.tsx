import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { modelID } from "@/ai/providers";
import { ModelPicker } from "./model-picker";

interface HeaderProps {
  selectedModel: modelID;
  setSelectedModel: (model: modelID) => void;
}

export const Header = ({ selectedModel, setSelectedModel }: HeaderProps) => {
  return (
    <div className="fixed right-0 left-0 w-full top-0 bg-(--background) z-10">
      <div className="flex justify-between items-center p-4">
        {/* Left: Logo and model picker */}
        <div className="flex flex-row items-center gap-6 shrink-0">
          <span className="flex flex-row items-center gap-2 home-links">
            <Link
              className="text-zinc-800 dark:text-zinc-100 -translate-y-[.5px]"
              rel="noopener"
              target="_blank"
              href="https://vercel.com/"
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
            </Link>
          </span>
          {/* Model picker aligned to the right of logo */}
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
