import React from "react";
import { Sidebar } from "@/components/sidebar";
import { ChatComposition } from "@/app/(chat)/chat-composition";

const Loading: React.FC = () => {
  return (
    <>
      <Sidebar />
      <ChatComposition />
    </>
  );
};

export default Loading;
