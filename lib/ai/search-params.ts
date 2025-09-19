import { parseAsString, createLoader } from "nuqs/server";

export const chatSearchParamsLoader = createLoader({
  chat: parseAsString,
});
