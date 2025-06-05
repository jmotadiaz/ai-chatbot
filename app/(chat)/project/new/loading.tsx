import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";

const Loading: React.FC = async () => {
  return (
    <div className="h-svh flex flex-col justify-center w-full stretch">
      <Header>
        <div className="flex flex-row items-center gap-6 shrink-0">
          <Logo />
          <NewChat />
        </div>
        <div className="flex flex-row items-center gap-2 shrink-0">
          <ThemeToggle />
        </div>
      </Header>
    </div>
  );
};

export default Loading;
