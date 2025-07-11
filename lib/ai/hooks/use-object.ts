import {
  experimental_useObject,
  Experimental_UseObjectHelpers,
  Experimental_UseObjectOptions,
} from "@ai-sdk/react";
import { useCallback, useState } from "react";

export type UseObjectParams<T> = Experimental_UseObjectOptions<T>;
export type UseObjectReturn<T> = Omit<
  Experimental_UseObjectHelpers<T, unknown>,
  "submit"
> & {
  input: string;
  handleInputChange: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  submit: () => void;
  handleSubmit: (e: React.FormEvent) => void;
};

export const useObject = <T>(args: UseObjectParams<T>): UseObjectReturn<T> => {
  const { submit: internalSubmit, ...objectResult } =
    experimental_useObject(args);
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
    handleInputChange,
    handleSubmit,
    submit,
  };
};
