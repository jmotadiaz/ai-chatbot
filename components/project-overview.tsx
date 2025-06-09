import { useChatContext } from "@/app/providers";
import { LogoIcon } from "./icons";

export const ProjectOverview = () => {
  const { title } = useChatContext();
  return (
    <div className="h-full flex flex-col items-center justify-end px-4">
      <h1 className="text-3xl text-center font-semibold mb-4">
        {title ? (
          title
        ) : (
          <div className="flex items-center gap-2">
            <LogoIcon className="mr-1" strokeWidth={2} size={42} /> Chatbot
          </div>
        )}
      </h1>
    </div>
  );
};
