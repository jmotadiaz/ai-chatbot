import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";

const Loading: React.FC = async () => {
  return (
    <div className="h-svh flex flex-col justify-center w-full stretch">
      <Header.Container>
        <Header.Left>
          <Logo />
          <NewChat />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
    </div>
  );
};

export default Loading;
