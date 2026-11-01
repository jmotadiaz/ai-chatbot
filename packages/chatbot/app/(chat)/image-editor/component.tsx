import { Header } from "@/components/layout/header/header";
import { ImageAutomaticEdition } from "@/components/image/automatic-edition";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";

export const ImageEditorLayout: React.FC = () => {
  return (
    <>
      <Header.Container>
        <Header.Left>
          <Logo />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <ImageAutomaticEdition />
    </>
  );
};
