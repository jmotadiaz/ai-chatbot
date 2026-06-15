"use client";

import { useCallback, useState } from "react";

export interface ChatInputState {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  handleInputChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
}

export const useChatInputState = (initialInput = ""): ChatInputState => {
  const [input, setInput] = useState(initialInput);
  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(event.target.value);
    },
    []
  );

  return { input, setInput, handleInputChange };
};


