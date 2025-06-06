import { useChatContext } from "@/app/providers";

export const ProjectOverview = () => {
  const { title } = useChatContext();
  return (
    <div className="h-full flex flex-col items-center justify-end px-4">
      <h1 className="text-3xl text-center font-semibold mb-4">
        {title || "AI Chatbot"}
      </h1>
    </div>
  );
};
