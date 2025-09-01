import { HomeChat } from "@/app/(chat)/(home)/component";
import { Sidebar } from "@/components/sidebar";

const Loading: React.FC = () => {
  return (
    <>
      <Sidebar />
      <HomeChat />
    </>
  );
};

export default Loading;
