import type {
  Experimental_UseObjectHelpers,
  Experimental_UseObjectOptions} from "@ai-sdk/react";
import {
  experimental_useObject
} from "@ai-sdk/react";
import { useCallback, useState } from "react";
import type * as z3 from "zod/v3";

export type UseObjectParams<T extends z3.Schema> =
  Experimental_UseObjectOptions<T, T>;
export type UseObjectReturn<T> = Omit<
  Experimental_UseObjectHelpers<T, T>,
  "submit"
> & {
  input: string;
  handleInputChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  submit: () => void;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  handleSubmit: (e: React.FormEvent) => void;
};

export const useObject = <T extends z3.Schema>(
  args: UseObjectParams<T>
): UseObjectReturn<T> => {
  const { submit: internalSubmit, ...objectResult } = experimental_useObject({
    ...args,
  });
  const [input, setInput] = useState("");

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    []
  );

  const submit = useCallback(() => {
    internalSubmit(input);
  }, [input, internalSubmit]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      submit();
    },
    [submit]
  );

  return {
    ...objectResult,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    submit,
  };
};
