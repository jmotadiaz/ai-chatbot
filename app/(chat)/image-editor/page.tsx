import { Sidebar } from "@/app/(chat)/sidebar";
import { Header } from "@/components/header";
import { ImageAutomaticEdition } from "@/components/image-automatic-edition";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";

const ImageEditorPage: React.FC = () => {
  return (
    <>
      <Sidebar />
      <Header.Container>
        <Header.Left>
          <Logo />
          <NewChat />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <ImageAutomaticEdition />
    </>
  );
};

export default ImageEditorPage;
